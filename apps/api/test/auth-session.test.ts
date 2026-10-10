// Tests du ticket L1-02 : connexion, rafraîchissement rotatif, déconnexion, verrouillage après 5 échecs.
// Vrai serveur HTTP (port 0) ; base de données et configuration SIMULÉES : aucune base ni .env nécessaire.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/common/crypto/tokens';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { MailService } from '../src/common/mail/mail.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_SESSION_MESSAGE,
} from '../src/modules/auth/session.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { refreshCount, userUpdateMany } from './support/fake-prisma-ops';

const JWT_SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const PASSWORD = 'un-mot-de-passe-solide-2026';
const MINUTE = 60_000;

// ---------- Fausse base de données ----------
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  emailVerifiedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  updatedAt: Date;
  hasPatientProfile: boolean;
  doctorStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}
interface RefreshRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

const db = { users: [] as UserRow[], refresh: [] as RefreshRow[] };

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      const u = db.users.find((row) =>
        where.email !== undefined ? row.email === where.email : row.id === where.id,
      );
      if (!u) return null;
      return {
        ...u,
        patientProfile: u.hasPatientProfile ? { userId: u.id } : null,
        doctorProfile: u.doctorStatus ? { verificationStatus: u.doctorStatus } : null,
      };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const u = db.users.find((row) => row.id === where.id)!;
      Object.assign(u, data, { updatedAt: new Date() }); // comme @updatedAt de Prisma
      return u;
    },
    // Comptage atomique des échecs de connexion (L1-13), voir support/fake-prisma-ops.ts.
    updateMany: async (args: Parameters<typeof userUpdateMany>[1]) =>
      userUpdateMany(db.users, args),
  },
  refreshToken: {
    findUnique: async ({ where }: { where: { tokenHash: string } }) => {
      const r = db.refresh.find((row) => row.tokenHash === where.tokenHash);
      if (!r) return null;
      const owner = db.users.find((u) => u.id === r.userId)!;
      return { ...r, user: { role: owner.role } };
    },
    create: async ({ data }: { data: Omit<RefreshRow, 'id' | 'rotatedAt' | 'revokedAt'> }) => {
      const row: RefreshRow = { ...data, id: randomUUID(), rotatedAt: null, revokedAt: null };
      db.refresh.push(row);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; familyId?: string; rotatedAt?: null; revokedAt?: null };
      data: Partial<RefreshRow>;
    }) => {
      const rows = db.refresh.filter(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.familyId === undefined || r.familyId === where.familyId) &&
          (!('rotatedAt' in where) || r.rotatedAt === null) &&
          (!('revokedAt' in where) || r.revokedAt === null),
      );
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    // Famille révoquée pendant un renouvellement (L1-13).
    count: async (args: Parameters<typeof refreshCount>[1]) => refreshCount(db.refresh, args),
  },
};

// Fausse configuration (voir auth-register.test.ts : le vrai ConfigService lirait le .env du poste).
const fakeConfigValues: Record<string, string> = {
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '30',
};
const fakeConfig = {
  get: (key: string) => fakeConfigValues[key],
  getOrThrow: (key: string) => {
    const value = fakeConfigValues[key];
    if (value === undefined) throw new Error(`Configuration absente du test : ${key}`);
    return value;
  },
};

class FakeInfraModule {}

let passwordHash = '';
function addUser(overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    email: 'jean@example.com',
    passwordHash,
    role: 'PATIENT',
    emailVerifiedAt: new Date('2026-10-01T08:00:00Z'),
    failedLogins: 0,
    lockedUntil: null,
    updatedAt: new Date('2026-10-01T08:00:00Z'),
    hasPatientProfile: false,
    doctorStatus: null,
    ...overrides,
  };
  db.users.push(row);
  return row;
}

interface LoginBody {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    role: string;
    profileCompleted: boolean;
    doctorVerificationStatus: string | null;
  };
}

describe('L1-02 : connexion, rafraîchissement et déconnexion', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: JWT_SECRET });

  const post = (path: string, body: unknown, accessToken?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const login = (email = 'jean@example.com', password = PASSWORD) =>
    post('/auth/login', { email, password });

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const moduleRef = await Test.createTestingModule({
      imports: [
        // Même garde globale que l'application : login/refresh publics, logout protégé.
        JwtModule.register({ global: true, secret: JWT_SECRET }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [
            { provide: PrismaService, useValue: fakePrisma },
            { provide: MailService, useValue: { send: async () => undefined } },
            { provide: ConfigService, useValue: fakeConfig },
          ],
          exports: [PrismaService, MailService, ConfigService],
        },
        AuthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    db.users = [];
    db.refresh = [];
  });

  describe('POST /auth/login', () => {
    it('connecte un patient vérifié : jetons + informations utiles au mobile', async () => {
      const user = addUser();

      const res = await login();
      const body = (await res.json()) as LoginBody;

      expect(res.status).toBe(200);
      expect(body.expiresInSeconds).toBe(900);
      expect(body.user).toEqual({
        id: user.id,
        role: 'PATIENT',
        profileCompleted: false, // pas encore de profil médical : le mobile lance l'assistant
        doctorVerificationStatus: null,
      });

      // Le jeton d'accès est un JWT signé : identifiant + rôle, valable 15 minutes, rien d'autre.
      const payload = jwt.verify<{ sub: string; role: string; iat: number; exp: number }>(
        body.accessToken,
      );
      expect(payload.sub).toBe(user.id);
      expect(payload.role).toBe('PATIENT');
      expect(payload.exp - payload.iat).toBe(900);
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub']);

      // Le jeton de rafraîchissement n'est stocké que haché.
      expect(db.refresh).toHaveLength(1);
      expect(db.refresh[0]!.tokenHash).toBe(hashToken(body.refreshToken));
      expect(db.refresh.some((r) => r.tokenHash === body.refreshToken)).toBe(false);
    });

    it('indique un profil complété et le statut d’un médecin', async () => {
      addUser({ email: 'patient@example.com', hasPatientProfile: true });
      addUser({ email: 'dr@example.com', role: 'DOCTOR', doctorStatus: 'PENDING' });

      const patient = (await (await login('patient@example.com')).json()) as LoginBody;
      const doctor = (await (await login('dr@example.com')).json()) as LoginBody;

      expect(patient.user.profileCompleted).toBe(true);
      expect(doctor.user).toMatchObject({
        role: 'DOCTOR',
        profileCompleted: true,
        doctorVerificationStatus: 'PENDING',
      });
    });

    it('même réponse 401 pour « email inconnu » et « mauvais mot de passe »', async () => {
      addUser();

      const wrongPassword = await login('jean@example.com', 'mauvais-mot-de-passe');
      const unknownEmail = await login('personne@example.com', 'mauvais-mot-de-passe');

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      const a = await wrongPassword.json();
      const b = await unknownEmail.json();
      expect(a).toEqual({ message: INVALID_CREDENTIALS_MESSAGE });
      expect(b).toEqual(a);
    });

    it('refuse la connexion sans email vérifié (403 EMAIL_NOT_VERIFIED), seulement avec le bon mot de passe', async () => {
      addUser({ emailVerifiedAt: null });

      const right = await login();
      const wrong = await login('jean@example.com', 'mauvais-mot-de-passe');

      expect(right.status).toBe(403);
      expect(((await right.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
      expect(wrong.status).toBe(401); // un inconnu n'apprend rien sur l'adresse
      expect(db.refresh).toHaveLength(0);
    });

    it('verrouille le compte 10 minutes au 5e échec (429 ACCOUNT_LOCKED + Retry-After)', async () => {
      const user = addUser();

      for (let i = 1; i <= 4; i++) {
        expect((await login('jean@example.com', 'mauvais-mot-de-passe')).status).toBe(401);
      }
      const fifth = await login('jean@example.com', 'mauvais-mot-de-passe');
      const body = (await fifth.json()) as { code: string; retryAfterSeconds: number };

      expect(fifth.status).toBe(429);
      expect(body.code).toBe('ACCOUNT_LOCKED');
      expect(body.retryAfterSeconds).toBe(600);
      expect(fifth.headers.get('retry-after')).toBe('600');
      expect(user.lockedUntil).toBeInstanceOf(Date);

      // Même le BON mot de passe est refusé pendant le verrouillage.
      const during = await login();
      expect(during.status).toBe(429);
      expect(db.refresh).toHaveLength(0);
    });

    it('après le verrouillage, le bon mot de passe fonctionne et remet le compteur à zéro', async () => {
      const user = addUser({ lockedUntil: new Date(Date.now() - 1000), failedLogins: 0 });

      const res = await login();

      expect(res.status).toBe(200);
      expect(user.lockedUntil).toBeNull();
      expect(user.failedLogins).toBe(0);
    });

    it('ne compte que les échecs des 10 dernières minutes', async () => {
      const user = addUser({ failedLogins: 4, updatedAt: new Date(Date.now() - 11 * MINUTE) });

      const res = await login('jean@example.com', 'mauvais-mot-de-passe');

      expect(res.status).toBe(401); // pas verrouillé : les 4 anciens échecs sont trop vieux
      expect(user.failedLogins).toBe(1);
      expect(user.lockedUntil).toBeNull();
    });

    it('une connexion réussie efface les échecs précédents', async () => {
      const user = addUser({ failedLogins: 3, updatedAt: new Date() });

      expect((await login()).status).toBe(200);
      expect(user.failedLogins).toBe(0);
    });

    it('refuse une requête mal formée (400)', async () => {
      const res = await post('/auth/login', { email: 'pas-une-adresse', password: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotation : donne une nouvelle paire, et l’ancien jeton ne fonctionne plus', async () => {
      const user = addUser();
      const first = (await (await login()).json()) as LoginBody;

      const res = await post('/auth/refresh', { refreshToken: first.refreshToken });
      const second = (await res.json()) as LoginBody;

      expect(res.status).toBe(200);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.expiresInSeconds).toBe(900);
      expect(jwt.verify<{ sub: string }>(second.accessToken).sub).toBe(user.id);
      expect(db.refresh).toHaveLength(2);
      expect(db.refresh[0]!.familyId).toBe(db.refresh[1]!.familyId); // même session

      const old = await post('/auth/refresh', { refreshToken: first.refreshToken });
      expect(old.status).toBe(401);
      expect(await old.json()).toEqual({ message: INVALID_SESSION_MESSAGE, code: 'TOKEN_INVALID' });
    });

    it('réutiliser un ancien jeton révoque toute la famille (le jeton le plus récent aussi)', async () => {
      addUser();
      const first = (await (await login()).json()) as LoginBody;
      const second = (await (
        await post('/auth/refresh', { refreshToken: first.refreshToken })
      ).json()) as LoginBody;

      // Un « voleur » rejoue le premier jeton…
      expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(401);
      // … donc le jeton légitime le plus récent est révoqué lui aussi.
      expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).status).toBe(401);
      expect(db.refresh.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it('ne révoque pas les autres sessions du même utilisateur (autre famille)', async () => {
      addUser();
      const phone = (await (await login()).json()) as LoginBody;
      const tablet = (await (await login()).json()) as LoginBody;
      await post('/auth/refresh', { refreshToken: phone.refreshToken });
      await post('/auth/refresh', { refreshToken: phone.refreshToken }); // réutilisation sur le téléphone

      expect((await post('/auth/refresh', { refreshToken: tablet.refreshToken })).status).toBe(200);
    });

    it('refuse un jeton expiré, un jeton inconnu et un jeton mal formé', async () => {
      addUser();
      const session = (await (await login()).json()) as LoginBody;
      db.refresh[0]!.expiresAt = new Date(Date.now() - 1000);

      const expired = await post('/auth/refresh', { refreshToken: session.refreshToken });
      const unknown = await post('/auth/refresh', { refreshToken: 'x'.repeat(43) });
      const malformed = await post('/auth/refresh', { refreshToken: 'court' });

      expect(expired.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(malformed.status).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('exige un jeton d’accès (401 sans)', async () => {
      const res = await post('/auth/logout', { refreshToken: 'x'.repeat(43) });
      expect(res.status).toBe(401);
    });

    it('termine la session : 204, puis le jeton de rafraîchissement ne marche plus', async () => {
      addUser();
      const session = (await (await login()).json()) as LoginBody;

      const res = await post(
        '/auth/logout',
        { refreshToken: session.refreshToken },
        session.accessToken,
      );

      expect(res.status).toBe(204);
      expect((await post('/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(
        401,
      );
    });

    it('ne peut pas fermer la session de quelqu’un d’autre (204 mais sans effet)', async () => {
      addUser({ email: 'jean@example.com' });
      addUser({ email: 'awa@example.com' });
      const jean = (await (await login('jean@example.com')).json()) as LoginBody;
      const awa = (await (await login('awa@example.com')).json()) as LoginBody;

      const res = await post('/auth/logout', { refreshToken: awa.refreshToken }, jean.accessToken);

      expect(res.status).toBe(204);
      expect((await post('/auth/refresh', { refreshToken: awa.refreshToken })).status).toBe(200);
    });
  });
});
