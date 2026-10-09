// Tests du ticket L1-01 : inscription patient / médecin et vérification de l'adresse email.
// Comme health.test.ts : vrai serveur HTTP (port 0), mais base de données et envoi d'emails SIMULÉS en mémoire.
// Aucune vraie base ni Mailpit n'est nécessaire : ces tests tournent partout, CI comprise.
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { REGISTER_ACCEPTED_MESSAGE } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PORTAL_URL = 'http://portail.test';
const PASSWORD = 'un-mot-de-passe-solide-2026';

// ---------- Fausse base de données (seulement ce que le module auth utilise) ----------
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: 'PATIENT' | 'DOCTOR';
  consentAt: Date | null;
  emailVerifiedAt: Date | null;
}
interface DoctorRow {
  userId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  institution: string;
  verificationStatus: 'PENDING';
}
interface TokenRow {
  id: string;
  userId: string;
  type: 'VERIFY_EMAIL' | 'RESET_PASSWORD';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const db = { users: [] as UserRow[], doctors: [] as DoctorRow[], tokens: [] as TokenRow[] };

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email: string } }) =>
      db.users.find((u) => u.email === where.email) ?? null,
    create: async ({
      data,
    }: {
      data: Omit<UserRow, 'id' | 'emailVerifiedAt'> & {
        doctorProfile?: { create: Omit<DoctorRow, 'userId' | 'verificationStatus'> };
      };
    }) => {
      // Même comportement que PostgreSQL : contrainte unique sur l'email (erreur Prisma P2002).
      if (db.users.some((u) => u.email === data.email)) throw { code: 'P2002' };
      const { doctorProfile, ...user } = data;
      const row: UserRow = { ...user, id: randomUUID(), emailVerifiedAt: null };
      db.users.push(row);
      if (doctorProfile) {
        db.doctors.push({ ...doctorProfile.create, userId: row.id, verificationStatus: 'PENDING' });
      }
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; emailVerifiedAt: null };
      data: { emailVerifiedAt: Date };
    }) => {
      const rows = db.users.filter((u) => u.id === where.id && u.emailVerifiedAt === null);
      rows.forEach((u) => (u.emailVerifiedAt = data.emailVerifiedAt));
      return { count: rows.length };
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
  // Transaction : tableau de requêtes déjà lancées, ou fonction qui reçoit le client.
  $transaction: async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof fakePrisma) => Promise<unknown>)(fakePrisma)
      : Promise.all(arg as Promise<unknown>[]),
};

// ---------- Faux service d'email : garde les emails « envoyés » ----------
let sentMails: OutgoingMail[] = [];
let mailFails = false;
const fakeMail = {
  send: async (mail: OutgoingMail) => {
    sentMails.push(mail);
    if (mailFails) throw new Error('SMTP indisponible');
  },
};

/** Extrait le jeton du lien contenu dans l'email (comme un utilisateur qui clique). */
function tokenFrom(mail: OutgoingMail | undefined): string {
  const match = mail?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error('Aucun lien de vérification dans le mail');
  return match[1];
}

class FakeInfraModule {}

describe('L1-01 : inscription et vérification de l’adresse email', () => {
  let app: INestApplication;
  let baseUrl: string;
  let throttleEnabled = false; // limitation de débit activée seulement pour le test dédié

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ PORTAL_URL: `${PORTAL_URL}/` })], // « / » final : le lien ne doit pas avoir « // »
        }),
        // Mêmes gardes globales que l'application réelle : les routes doivent rester publiques malgré elles.
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
          ],
          exports: [PrismaService, MailService],
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
    db.doctors = [];
    db.tokens = [];
    sentMails = [];
    mailFails = false;
    throttleEnabled = false;
  });

  describe('POST /auth/register', () => {
    it('crée un compte patient non vérifié et envoie un lien de vérification (202, sans jeton de connexion)', async () => {
      const res = await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: true,
      });
      const text = await res.text();

      expect(res.status).toBe(202);
      expect(JSON.parse(text)).toEqual({ message: REGISTER_ACCEPTED_MESSAGE });

      expect(db.users).toHaveLength(1);
      const user = db.users[0]!;
      expect(user.role).toBe('PATIENT');
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.consentAt).toBeInstanceOf(Date);
      // Mot de passe : jamais en clair, haché avec argon2id.
      expect(user.passwordHash).not.toContain(PASSWORD);
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(await argon2.verify(user.passwordHash, PASSWORD)).toBe(true);

      // Email envoyé à la bonne adresse, avec un lien vers le portail.
      expect(sentMails).toHaveLength(1);
      const mail = sentMails[0]!;
      expect(mail.to).toBe('jean@example.com');
      expect(mail.subject).toContain('Afyabora');
      expect(mail.text).toContain(`${PORTAL_URL}/verify-email?token=`);
      expect(mail.text).not.toContain(PASSWORD);

      // Seul le HASH du jeton est en base ; le jeton lui-même n'est pas dans la réponse HTTP.
      const token = tokenFrom(mail);
      expect(token.length).toBeGreaterThanOrEqual(43); // 32 octets en base64url
      expect(db.tokens).toHaveLength(1);
      expect(db.tokens[0]!.tokenHash).toBe(hashToken(token));
      expect(db.tokens.some((t) => t.tokenHash === token)).toBe(false);
      expect(text).not.toContain(token);

      // Valable 24 heures.
      const hoursLeft = (db.tokens[0]!.expiresAt.getTime() - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(23.9);
      expect(hoursLeft).toBeLessThanOrEqual(24);
    });

    it('enregistre l’adresse en minuscules et sans espaces', async () => {
      const res = await post('/auth/register', {
        email: '  Jean.Dupont@Example.COM ',
        password: PASSWORD,
        consent: true,
      });
      expect(res.status).toBe(202);
      expect(db.users[0]!.email).toBe('jean.dupont@example.com');
    });

    it('refuse un mot de passe de 8 caractères avec un message clair (400)', async () => {
      const res = await post('/auth/register', {
        email: 'jean@example.com',
        password: 'abcdefgh',
        consent: true,
      });
      const body = (await res.json()) as {
        message: string;
        issues: { path: string; message: string }[];
      };

      expect(res.status).toBe(400);
      expect(body.issues).toContainEqual({
        path: 'password',
        message: 'Le mot de passe doit contenir au moins 12 caractères',
      });
      expect(db.users).toHaveLength(0);
      expect(sentMails).toHaveLength(0);
    });

    it('refuse une inscription sans consentement explicite (absent ou false)', async () => {
      const absent = await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
      });
      const refused = await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: false,
      });

      expect(absent.status).toBe(400);
      expect(refused.status).toBe(400);
      expect(db.users).toHaveLength(0);
    });

    it('refuse une adresse email invalide', async () => {
      const res = await post('/auth/register', {
        email: 'pas-une-adresse',
        password: PASSWORD,
        consent: true,
      });
      expect(res.status).toBe(400);
    });

    it('adresse déjà inscrite mais non vérifiée : même réponse, nouveau lien, l’ancien ne marche plus', async () => {
      await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: true,
      });
      const oldToken = tokenFrom(sentMails[0]);
      const originalHash = db.users[0]!.passwordHash;

      const res = await post('/auth/register', {
        email: 'jean@example.com',
        password: 'un-autre-mot-de-passe-2026',
        consent: true,
      });

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ message: REGISTER_ACCEPTED_MESSAGE });
      expect(db.users).toHaveLength(1); // pas de doublon
      expect(db.users[0]!.passwordHash).toBe(originalHash); // le mot de passe n'est pas modifiable ainsi
      expect(sentMails).toHaveLength(2);
      expect(tokenFrom(sentMails[1])).not.toBe(oldToken);

      const oldLink = await post('/auth/verify-email', { token: oldToken });
      expect(oldLink.status).toBe(400);
    });

    it('adresse déjà vérifiée : même réponse 202, aucun email, rien ne change (pas d’énumération)', async () => {
      await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: true,
      });
      await post('/auth/verify-email', { token: tokenFrom(sentMails[0]) });
      sentMails = [];
      const before = structuredClone(db.users);

      const res = await post('/auth/register', {
        email: 'jean@example.com',
        password: 'un-autre-mot-de-passe-2026',
        consent: true,
      });

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ message: REGISTER_ACCEPTED_MESSAGE });
      expect(sentMails).toHaveLength(0);
      expect(db.users).toEqual(before);
    });

    it('répond 202 même si le serveur d’email est en panne (le compte est créé, on peut redemander un lien)', async () => {
      mailFails = true;
      const res = await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: true,
      });
      expect(res.status).toBe(202);
      expect(db.users).toHaveLength(1);
    });

    it('est accessible sans jeton de connexion et limite les tentatives (429 à la 6e en une minute)', async () => {
      throttleEnabled = true;
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await post('/auth/register', {
          email: `patient${i}@example.com`,
          password: PASSWORD,
          consent: true,
        });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
      expect(statuses[5]).toBe(429);
    });
  });

  describe('POST /auth/register-doctor', () => {
    const doctor = {
      email: 'dr.mbala@example.com',
      password: PASSWORD,
      consent: true,
      firstName: 'Aline',
      lastName: 'Mbala',
      licenseNumber: 'CNOM-12345',
      institution: 'Hôpital de démonstration',
    };

    it('crée un compte médecin avec un profil « en attente » et envoie le lien de vérification', async () => {
      const res = await post('/auth/register-doctor', doctor);

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ message: REGISTER_ACCEPTED_MESSAGE });
      expect(db.users[0]!.role).toBe('DOCTOR');
      expect(db.doctors).toEqual([
        expect.objectContaining({
          userId: db.users[0]!.id,
          licenseNumber: 'CNOM-12345',
          verificationStatus: 'PENDING',
        }),
      ]);
      expect(sentMails).toHaveLength(1);
      expect(sentMails[0]!.text).toContain('examiné');
    });

    it('refuse une inscription médecin sans numéro d’ordre', async () => {
      const { licenseNumber: _omis, ...sansNumero } = doctor;
      const res = await post('/auth/register-doctor', sansNumero);
      expect(res.status).toBe(400);
      expect(db.users).toHaveLength(0);
    });
  });

  describe('POST /auth/verify-email', () => {
    async function registerAndGetToken(): Promise<string> {
      await post('/auth/register', {
        email: 'jean@example.com',
        password: PASSWORD,
        consent: true,
      });
      return tokenFrom(sentMails.at(-1));
    }

    it('vérifie l’adresse avec le jeton reçu (200)', async () => {
      const token = await registerAndGetToken();

      const res = await post('/auth/verify-email', { token });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: 'Adresse email vérifiée. Vous pouvez vous connecter.',
      });
      expect(db.users[0]!.emailVerifiedAt).toBeInstanceOf(Date);
      expect(db.tokens[0]!.usedAt).toBeInstanceOf(Date);
    });

    it('refuse un jeton déjà utilisé (usage unique) avec le code TOKEN_INVALID', async () => {
      const token = await registerAndGetToken();
      await post('/auth/verify-email', { token });

      const res = await post('/auth/verify-email', { token });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        message: 'Lien de vérification invalide ou expiré.',
        code: 'TOKEN_INVALID',
      });
    });

    it('refuse un jeton expiré (plus de 24 h) sans vérifier le compte', async () => {
      const token = await registerAndGetToken();
      db.tokens[0]!.expiresAt = new Date(Date.now() - 1000);

      const res = await post('/auth/verify-email', { token });

      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('TOKEN_INVALID');
      expect(db.users[0]!.emailVerifiedAt).toBeNull();
    });

    it('refuse un jeton inconnu (bien formé) et un jeton trop court', async () => {
      const unknown = await post('/auth/verify-email', { token: generateOpaqueToken() });
      const tooShort = await post('/auth/verify-email', { token: 'abc' });

      expect(unknown.status).toBe(400);
      expect(((await unknown.json()) as { code: string }).code).toBe('TOKEN_INVALID');
      expect(tooShort.status).toBe(400);
    });

    it('n’accepte pas un jeton de réinitialisation de mot de passe', async () => {
      await registerAndGetToken();
      const resetToken = generateOpaqueToken();
      db.tokens.push({
        id: randomUUID(),
        userId: db.users[0]!.id,
        type: 'RESET_PASSWORD',
        tokenHash: hashToken(resetToken),
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: null,
      });

      const res = await post('/auth/verify-email', { token: resetToken });

      expect(res.status).toBe(400);
      expect(db.users[0]!.emailVerifiedAt).toBeNull();
    });
  });
});
