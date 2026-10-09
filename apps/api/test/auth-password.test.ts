// Tests du ticket L1-03 : mot de passe oublié et réinitialisation.
// Vrai serveur HTTP (port 0) ; base, emails et configuration SIMULÉS : aucune base, ni Mailpit, ni .env nécessaire.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashToken } from '../src/common/crypto/tokens';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { MailService, type OutgoingMail } from '../src/common/mail/mail.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  FORGOT_PASSWORD_MESSAGE,
  PASSWORD_RESET_MESSAGE,
} from '../src/modules/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PORTAL_URL = 'http://portail.test';
const OLD_PASSWORD = 'ancien-mot-de-passe-2026';
const NEW_PASSWORD = 'nouveau-mot-de-passe-2026';

// ---------- Fausse base de données ----------
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: 'PATIENT';
  emailVerifiedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}
interface TokenRow {
  id: string;
  userId: string;
  type: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
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

const db = { users: [] as UserRow[], tokens: [] as TokenRow[], refresh: [] as RefreshRow[] };

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      const u = db.users.find((row) =>
        where.email !== undefined ? row.email === where.email : row.id === where.id,
      );
      // Champs supplémentaires lus par la connexion (L1-02).
      return u ? { ...u, patientProfile: null, doctorProfile: null } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const u = db.users.find((row) => row.id === where.id)!;
      Object.assign(u, data, { updatedAt: new Date() });
      return u;
    },
  },
  emailToken: {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      db.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
    create: async ({ data }: { data: Omit<TokenRow, 'id' | 'usedAt'> }) => {
      const row: TokenRow = { ...data, id: randomUUID(), usedAt: null };
      db.tokens.push(row);
      return row;
    },
    deleteMany: async ({ where }: { where: { userId: string; type: string; usedAt: null } }) => {
      const before = db.tokens.length;
      db.tokens = db.tokens.filter(
        (t) => !(t.userId === where.userId && t.type === where.type && t.usedAt === null),
      );
      return { count: before - db.tokens.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; usedAt: null };
      data: { usedAt: Date };
    }) => {
      const rows = db.tokens.filter((t) => t.id === where.id && t.usedAt === null);
      rows.forEach((t) => (t.usedAt = data.usedAt));
      return { count: rows.length };
    },
  },
  refreshToken: {
    create: async ({ data }: { data: Omit<RefreshRow, 'id' | 'rotatedAt' | 'revokedAt'> }) => {
      const row: RefreshRow = { ...data, id: randomUUID(), rotatedAt: null, revokedAt: null };
      db.refresh.push(row);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { userId: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => {
      const rows = db.refresh.filter((r) => r.userId === where.userId && r.revokedAt === null);
      rows.forEach((r) => (r.revokedAt = data.revokedAt));
      return { count: rows.length };
    },
  },
  $transaction: async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof fakePrisma) => Promise<unknown>)(fakePrisma)
      : Promise.all(arg as Promise<unknown>[]),
};

let sentMails: OutgoingMail[] = [];
const fakeMail = {
  send: async (mail: OutgoingMail) => {
    sentMails.push(mail);
  },
};

// Fausse configuration (le vrai ConfigService lirait le .env du poste : voir auth-register.test.ts).
const fakeConfigValues: Record<string, string> = {
  PORTAL_URL: `${PORTAL_URL}/`,
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

function tokenFrom(mail: OutgoingMail | undefined): string {
  const match = mail?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error('Aucun lien de réinitialisation dans le mail');
  return match[1];
}

class FakeInfraModule {}

let oldPasswordHash = '';
function addUser(overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    email: 'jean@example.com',
    passwordHash: oldPasswordHash,
    role: 'PATIENT',
    emailVerifiedAt: new Date('2026-10-01T08:00:00Z'),
    failedLogins: 0,
    lockedUntil: null,
    updatedAt: new Date('2026-10-01T08:00:00Z'),
    ...overrides,
  };
  db.users.push(row);
  return row;
}
function addRefresh(userId: string): RefreshRow {
  const row: RefreshRow = {
    id: randomUUID(),
    userId,
    familyId: randomUUID(),
    tokenHash: hashToken(generateOpaqueToken()),
    expiresAt: new Date(Date.now() + 86_400_000),
    rotatedAt: null,
    revokedAt: null,
  };
  db.refresh.push(row);
  return row;
}

describe('L1-03 : mot de passe oublié et réinitialisation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let throttleEnabled = false;

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const forgot = (email = 'jean@example.com') => post('/auth/forgot-password', { email });
  const reset = (token: string, password = NEW_PASSWORD) =>
    post('/auth/reset-password', { token, password });
  const login = (password: string) => post('/auth/login', { email: 'jean@example.com', password });

  beforeAll(async () => {
    oldPasswordHash = await argon2.hash(OLD_PASSWORD, { type: argon2.argon2id });
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'secret-de-test-uniquement-0123456789abcdef' }),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 120 }],
          skipIf: () => !throttleEnabled,
        }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [
            { provide: PrismaService, useValue: fakePrisma },
            { provide: MailService, useValue: fakeMail },
            { provide: ConfigService, useValue: fakeConfig },
          ],
          exports: [PrismaService, MailService, ConfigService],
        },
        AuthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
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
    db.tokens = [];
    db.refresh = [];
    sentMails = [];
    throttleEnabled = false;
  });

  describe('POST /auth/forgot-password', () => {
    it('compte existant : 202 et un lien de réinitialisation valable 1 heure (seul le hash est en base)', async () => {
      const user = addUser();

      const res = await forgot();
      const text = await res.text();

      expect(res.status).toBe(202);
      expect(JSON.parse(text)).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(sentMails).toHaveLength(1);
      expect(sentMails[0]!.to).toBe('jean@example.com');
      expect(sentMails[0]!.subject).toContain('Afyabora');
      expect(sentMails[0]!.text).toContain(`${PORTAL_URL}/reset-password?token=`);

      const token = tokenFrom(sentMails[0]);
      expect(db.tokens).toHaveLength(1);
      expect(db.tokens[0]).toMatchObject({ userId: user.id, type: 'RESET_PASSWORD' });
      expect(db.tokens[0]!.tokenHash).toBe(hashToken(token));
      expect(text).not.toContain(token);
      const minutesLeft = (db.tokens[0]!.expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(59);
      expect(minutesLeft).toBeLessThanOrEqual(60);
    });

    it('adresse inconnue : même réponse 202, aucun email (pas d’énumération)', async () => {
      addUser();
      const known = await (await forgot('jean@example.com')).json();
      sentMails = [];

      const res = await forgot('personne@example.com');

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual(known);
      expect(sentMails).toHaveLength(0);
    });

    it('une nouvelle demande annule le lien précédent', async () => {
      addUser();
      await forgot();
      const first = tokenFrom(sentMails[0]);
      await forgot();

      expect(db.tokens).toHaveLength(1);
      expect((await reset(first)).status).toBe(400);
      expect((await reset(tokenFrom(sentMails[1]))).status).toBe(200);
    });

    it('refuse une adresse invalide (400) et limite les demandes (429 à la 6e en une minute)', async () => {
      expect((await forgot('pas-une-adresse')).status).toBe(400);

      throttleEnabled = true;
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await forgot(`p${i}@example.com`)).status);
      expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('change le mot de passe, ferme toutes les sessions, et seul le nouveau mot de passe fonctionne', async () => {
      const user = addUser({ failedLogins: 3, updatedAt: new Date() });
      const other = addUser({ email: 'awa@example.com' });
      const phone = addRefresh(user.id);
      const tablet = addRefresh(user.id);
      const awaSession = addRefresh(other.id);
      await forgot();

      const res = await reset(tokenFrom(sentMails[0]));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: PASSWORD_RESET_MESSAGE });
      expect(await argon2.verify(user.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(user.failedLogins).toBe(0);
      expect(db.tokens[0]!.usedAt).toBeInstanceOf(Date);

      // Toutes les sessions de Jean sont révoquées, pas celles d'Awa.
      expect(phone.revokedAt).toBeInstanceOf(Date);
      expect(tablet.revokedAt).toBeInstanceOf(Date);
      expect(awaSession.revokedAt).toBeNull();

      expect((await login(OLD_PASSWORD)).status).toBe(401);
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });

    it('lève un verrouillage en cours (le propriétaire a prouvé son identité)', async () => {
      const user = addUser({ lockedUntil: new Date(Date.now() + 5 * 60_000) });
      await forgot();

      expect((await reset(tokenFrom(sentMails[0]))).status).toBe(200);
      expect(user.lockedUntil).toBeNull();
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });

    it('compte jamais vérifié : la réinitialisation vérifie aussi l’adresse', async () => {
      const user = addUser({ emailVerifiedAt: null });
      await forgot();

      expect((await reset(tokenFrom(sentMails[0]))).status).toBe(200);
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });

    it('lien à usage unique : la 2e utilisation est refusée (TOKEN_INVALID)', async () => {
      addUser();
      await forgot();
      const token = tokenFrom(sentMails[0]);
      await reset(token);

      const again = await reset(token, 'encore-un-autre-mot-de-passe');

      expect(again.status).toBe(400);
      expect(((await again.json()) as { code: string }).code).toBe('TOKEN_INVALID');
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });

    it('refuse un lien expiré sans changer le mot de passe', async () => {
      const user = addUser();
      await forgot();
      db.tokens[0]!.expiresAt = new Date(Date.now() - 1000);

      const res = await reset(tokenFrom(sentMails[0]));

      expect(res.status).toBe(400);
      expect(user.passwordHash).toBe(oldPasswordHash);
    });

    it('n’accepte pas un jeton de vérification d’email ni un jeton inconnu', async () => {
      const user = addUser();
      const verifyToken = generateOpaqueToken();
      db.tokens.push({
        id: randomUUID(),
        userId: user.id,
        type: 'VERIFY_EMAIL',
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: null,
      });

      expect((await reset(verifyToken)).status).toBe(400);
      expect((await reset(generateOpaqueToken())).status).toBe(400);
      expect(user.passwordHash).toBe(oldPasswordHash);
    });

    it('refuse un nouveau mot de passe de 8 caractères sans consommer le lien', async () => {
      addUser();
      await forgot();
      const token = tokenFrom(sentMails[0]);

      const res = await reset(token, 'abcdefgh');

      expect(res.status).toBe(400);
      expect(db.tokens[0]!.usedAt).toBeNull(); // le lien reste utilisable avec un mot de passe valide
      expect((await reset(token)).status).toBe(200);
    });
  });
});
