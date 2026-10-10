// Tests du ticket L1-13 : sécurité de l'authentification, en plus de ceux de L1-02 (auth-session.test.ts).
// Ils couvrent surtout ce qui se passe quand plusieurs requêtes arrivent EN MÊME TEMPS, et deux défauts
// trouvés et corrigés pendant ce ticket (reproduits d'abord sur l'API locale) :
//  1. 5 mauvais mots de passe envoyés simultanément ne verrouillaient pas le compte (compteur lu puis
//     réécrit) → le comptage est maintenant atomique en base ;
//  2. deux renouvellements simultanés du même jeton : le nouveau jeton du « gagnant » échappait à la
//     révocation de la famille → il est révoqué lui aussi.
// Plus : en-têtes « no-store » sur les réponses qui contiennent des jetons, contenu minimal du JWT,
// limites par adresse IP distinctes du verrouillage du compte, aucun secret dans les journaux.
// Vrai serveur HTTP (port 0) ; base de données et configuration SIMULÉES : aucune base ni .env nécessaire.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const WRONG = 'mauvais-mot-de-passe';
const MINUTE = 60_000;

// ---------- Fausse base de données (mêmes formes que auth-session.test.ts) ----------
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  emailVerifiedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  updatedAt: Date;
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
/** Nombre de comptes modifiés (pour vérifier qu'une requête n'a RIEN modifié). */
let userWrites = 0;
/**
 * Point d'arrêt : si défini, s'exécute JUSTE AVANT la création d'un jeton de rafraîchissement.
 * Permet de reproduire à coup sûr un ordre précis entre deux requêtes simultanées.
 */
let beforeRefreshCreate: (() => Promise<void>) | null = null;

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      const u = db.users.find((row) =>
        where.email !== undefined ? row.email === where.email : row.id === where.id,
      );
      return u ? { ...u, patientProfile: null, doctorProfile: null } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      userWrites += 1;
      const u = db.users.find((row) => row.id === where.id)!;
      Object.assign(u, data, { updatedAt: new Date() });
      return u;
    },
    updateMany: async (args: Parameters<typeof userUpdateMany>[1]) => {
      const result = userUpdateMany(db.users, args);
      userWrites += result.count; // une condition non remplie ne modifie rien
      return result;
    },
  },
  refreshToken: {
    findUnique: async ({ where }: { where: { tokenHash: string } }) => {
      const r = db.refresh.find((row) => row.tokenHash === where.tokenHash);
      if (!r) return null;
      const owner = db.users.find((u) => u.id === r.userId)!;
      return { ...r, user: { role: owner.role } };
    },
    create: async ({ data }: { data: Omit<RefreshRow, 'id' | 'rotatedAt' | 'revokedAt'> }) => {
      const pause = beforeRefreshCreate;
      if (pause) {
        beforeRefreshCreate = null; // une seule fois
        await pause();
      }
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
    count: async (args: Parameters<typeof refreshCount>[1]) => refreshCount(db.refresh, args),
  },
};

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
    ...overrides,
  };
  db.users.push(row);
  return row;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('L1-13 : sécurité de l’authentification', () => {
  let app: INestApplication;
  let baseUrl: string;
  let throttleEnabled = false; // limites par IP activées seulement dans le bloc qui les teste
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
  const refresh = (refreshToken: string) => post('/auth/refresh', { refreshToken });

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: JWT_SECRET }),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 120 }],
          skipIf: () => !throttleEnabled,
        }),
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
      providers: [
        // Mêmes gardes globales que l'application réelle.
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
    db.refresh = [];
    userWrites = 0;
    throttleEnabled = false;
    beforeRefreshCreate = null;
  });

  // ---------------------------------------------------------------------------------------------
  describe('verrouillage du compte (5 échecs en 10 minutes)', () => {
    it('5 mauvais mots de passe envoyés EN MÊME TEMPS verrouillent bien le compte', async () => {
      const user = addUser();

      const results = await Promise.all(
        [1, 2, 3, 4, 5].map(() => login('jean@example.com', WRONG)),
      );
      const statuses = results.map((r) => r.status);

      // Avant la correction : 5 × 401 et compteur à 1 ou 2, jamais de verrouillage.
      expect(statuses).toContain(429);
      expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
      expect(user.lockedUntil).toBeInstanceOf(Date);
      expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 9 * MINUTE);
      // Le bon mot de passe est refusé ensuite.
      expect((await login()).status).toBe(429);
      expect(db.refresh).toHaveLength(0);
    });

    it('après une longue pause, une rafale simultanée est comptée en entier (pas de remise à 1 en double)', async () => {
      // Dernier échec il y a 20 minutes : la fenêtre est terminée, le compteur doit repartir de zéro…
      const user = addUser({ failedLogins: 3, updatedAt: new Date(Date.now() - 20 * MINUTE) });

      await Promise.all([1, 2, 3, 4].map(() => login('jean@example.com', WRONG)));

      // … mais chacun des 4 nouveaux essais compte (sinon plusieurs « remises à 1 » se marcheraient dessus).
      expect(user.failedLogins).toBe(4);
      expect(user.lockedUntil).toBeNull();
    });

    it('pendant le verrouillage, un mauvais mot de passe n’est même pas vérifié et ne prolonge rien', async () => {
      const lockedUntil = new Date(Date.now() + 5 * MINUTE);
      const user = addUser({ lockedUntil, failedLogins: 0 });

      const res = await login('jean@example.com', WRONG);

      expect(res.status).toBe(429);
      expect(user.lockedUntil).toEqual(lockedUntil); // même date de fin
      expect(user.failedLogins).toBe(0);
      expect(userWrites).toBe(0); // aucune écriture
    });

    it('après la fin du verrouillage, un nouvel échec recommence à 1 (pas de re-verrouillage immédiat)', async () => {
      // Verrouillé il y a 11 minutes pour 10 minutes : c'est terminé.
      const user = addUser({
        lockedUntil: new Date(Date.now() - MINUTE),
        failedLogins: 0,
        updatedAt: new Date(Date.now() - 11 * MINUTE),
      });

      const res = await login('jean@example.com', WRONG);

      expect(res.status).toBe(401);
      expect(user.failedLogins).toBe(1);
    });

    it('le verrouillage d’un compte ne touche pas les autres comptes', async () => {
      addUser({ email: 'jean@example.com' });
      addUser({ email: 'awa@example.com' });

      for (let i = 0; i < 5; i++) await login('jean@example.com', WRONG);

      expect((await login('jean@example.com')).status).toBe(429);
      expect((await login('awa@example.com')).status).toBe(200);
    });

    it('email inconnu : même réponse qu’un mauvais mot de passe, et aucune écriture en base', async () => {
      addUser();

      const unknown = await login('personne@example.com', WRONG);
      const wrong = await login('jean@example.com', WRONG);

      expect(unknown.status).toBe(401);
      expect(await unknown.json()).toEqual(await wrong.json());
      expect(await login('personne@example.com', WRONG).then((r) => r.json())).toEqual({
        message: INVALID_CREDENTIALS_MESSAGE,
      });
      // Seul le compte existant a été modifié (1 écriture pour « jean »), rien pour l'inconnu.
      expect(userWrites).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('email non vérifié', () => {
    it('bon mot de passe : 403, aucun jeton créé, et l’adresse doit être vérifiée d’abord', async () => {
      addUser({ emailVerifiedAt: null });

      const res = await login();

      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
      expect(db.refresh).toHaveLength(0);
    });

    it('les mauvais mots de passe comptent aussi : un compte non vérifié se verrouille', async () => {
      const user = addUser({ emailVerifiedAt: null });

      for (let i = 0; i < 4; i++) expect((await login('jean@example.com', WRONG)).status).toBe(401);
      expect((await login('jean@example.com', WRONG)).status).toBe(429);
      expect(user.lockedUntil).toBeInstanceOf(Date);
    });

    it('l’adresse est reconnue quelle que soit la casse et les espaces autour', async () => {
      addUser({ email: 'jean@example.com' });

      expect((await login('  Jean@Example.COM ')).status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('jetons', () => {
    it('le jeton d’accès ne contient que l’identifiant et le rôle (aucune donnée personnelle)', async () => {
      const user = addUser();
      const { accessToken } = (await (await login()).json()) as Tokens;

      const payload = jwt.verify<Record<string, unknown>>(accessToken);

      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
      expect(payload.sub).toBe(user.id);
      expect(payload.role).toBe('PATIENT');
      expect(accessToken).not.toContain('jean');
    });

    it('les réponses qui contiennent des jetons ne sont gardées par aucun cache (no-store)', async () => {
      addUser();
      const first = await login();
      const tokens = (await first.json()) as Tokens;
      const renewed = await refresh(tokens.refreshToken);

      for (const res of [first, renewed]) {
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('pragma')).toBe('no-cache');
      }
    });

    it('un jeton d’accès présenté comme jeton de rafraîchissement est refusé', async () => {
      addUser();
      const { accessToken } = (await (await login()).json()) as Tokens;

      const res = await refresh(accessToken);

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ message: INVALID_SESSION_MESSAGE, code: 'TOKEN_INVALID' });
      expect(db.refresh).toHaveLength(1); // aucun nouveau jeton
    });

    it('deux renouvellements SIMULTANÉS du même jeton : la session est fermée, aucun jeton ne survit', async () => {
      addUser();
      const { refreshToken } = (await (await login()).json()) as Tokens;

      const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
      const statuses = results.map((r) => r.status);

      // Au plus un seul a pu recevoir une réponse 200…
      expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(1);
      expect(statuses).toContain(401);
      // … et dans tous les cas, plus AUCUN jeton de cette session n'est utilisable.
      expect(db.refresh.every((r) => r.revokedAt !== null || r.rotatedAt !== null)).toBe(true);
      for (const res of results.filter((r) => r.status === 200)) {
        const winner = (await res.json()) as Tokens;
        expect((await refresh(winner.refreshToken)).status).toBe(401);
      }
    });

    it('réutilisation détectée PENDANT un renouvellement : le jeton en cours de création est révoqué aussi', async () => {
      addUser();
      const { refreshToken } = (await (await login()).json()) as Tokens;
      let competitor: Response | null = null;

      // Ordre exact reproduit : la requête A a consommé le jeton et va créer le nouveau ; à ce moment
      // précis, la requête B rejoue le même jeton (réutilisation → famille révoquée).
      beforeRefreshCreate = async () => {
        competitor = await refresh(refreshToken);
      };
      const first = await refresh(refreshToken);

      expect(competitor!.status).toBe(401);
      // Avant la correction : 200, et ce nouveau jeton restait valable malgré la révocation.
      expect(first.status).toBe(401);
      expect(db.refresh.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it('après une déconnexion, le jeton est refusé et une 2e déconnexion ne change rien (204)', async () => {
      addUser();
      const session = (await (await login()).json()) as Tokens;
      const body = { refreshToken: session.refreshToken };

      expect((await post('/auth/logout', body, session.accessToken)).status).toBe(204);
      expect((await refresh(session.refreshToken)).status).toBe(401);
      expect((await post('/auth/logout', body, session.accessToken)).status).toBe(204);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('limites par adresse IP (en plus du verrouillage du compte)', () => {
    it('connexion : 429 à la 11e en une minute, sans verrouiller le compte', async () => {
      const user = addUser();
      throttleEnabled = true;

      for (let i = 1; i <= 10; i++) expect((await login()).status).toBe(200);
      const eleventh = await login();
      const body = (await eleventh.json()) as { code?: string };

      expect(eleventh.status).toBe(429);
      expect(body.code).not.toBe('ACCOUNT_LOCKED'); // c'est la limite de l'adresse IP, pas le compte
      expect(user.lockedUntil).toBeNull();
    });

    it('renouvellement : 429 à la 31e en une minute', async () => {
      throttleEnabled = true;
      const garbage = 'x'.repeat(43);

      for (let i = 1; i <= 30; i++) expect((await refresh(garbage)).status).toBe(401);
      expect((await refresh(garbage)).status).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('journaux', () => {
    it('aucun mot de passe ni jeton n’apparaît dans les journaux du serveur', async () => {
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      try {
        addUser();
        addUser({ email: 'awa@example.com', emailVerifiedAt: null });
        await login('jean@example.com', WRONG); // échec
        await login('awa@example.com'); // email non vérifié
        const session = (await (await login()).json()) as Tokens; // succès
        const renewed = (await (await refresh(session.refreshToken)).json()) as Tokens;
        await refresh(session.refreshToken); // réutilisation détectée
        await post('/auth/logout', { refreshToken: renewed.refreshToken }, renewed.accessToken);

        const logs = written.join('\n');
        for (const secret of [
          PASSWORD,
          WRONG,
          session.refreshToken,
          session.accessToken,
          renewed.refreshToken,
          renewed.accessToken,
        ]) {
          expect(logs).not.toContain(secret);
        }
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
    });
  });
});
