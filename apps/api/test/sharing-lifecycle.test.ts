// Ticket L5-04 : fin d'un partage (révocation, expiration) et contrôle de l'accès à chaque requête, sur une
// VRAIE base PostgreSQL : vrai serveur HTTP, vraies gardes, vrai Prisma. Les sessions sont créées et
// scannées par les vraies routes (POST /shares, POST /shares/claim) : c'est le parcours de la démo.
// Ne tourne que sur une base « …_test » (test/support/test-database.ts).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { shareStatusResponseSchema, type CreateShareResponse } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { ShareExpiryJob } from '../src/modules/sharing/share-expiry';
import { ShareLifecycleService } from '../src/modules/sharing/share-lifecycle.service';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';

describe.skipIf(!isTestDatabase(DB_URL))('L5-04 : révocation et expiration (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let baseUrl: string;
  let lifecycle: ShareLifecycleService;
  let job: ShareExpiryJob;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const drA = randomUUID();
  const drB = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const call = async (method: string, path: string, who: string | null, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  };
  /** Session en attente de scan, créée par la vraie route. */
  const pending = async (patient = awa, categories = ['GLUCOSE_HISTORY', 'MEALS']) => {
    const res = await call('POST', '/shares', token(patient), { categories, duration: 'MIN_30' });
    expect(res.status).toBe(201);
    return res.body as unknown as CreateShareResponse;
  };
  /** Session ouverte : créée puis scannée par `doctor` (vraies routes). */
  const active = async (patient = awa, doctor = drA, categories?: string[]) => {
    const qr = await pending(patient, categories);
    const res = await call('POST', '/shares/claim', token(doctor, 'DOCTOR'), {
      token: qr.token.token,
    });
    expect(res.status).toBe(200);
    return qr.session.id;
  };
  /**
   * Recule tout l'accès dans le temps (scan, ligne de journal du scan, fin) : il est « échu » depuis `msAgo`
   * mais encore marqué ACTIVE, comme une session que la tâche n'a pas encore rangée.
   */
  const makeDue = async (id: string, msAgo = 1000) => {
    const { claimedAt, expiresAt } = await row(id);
    const shift = (expiresAt as Date).getTime() - (Date.now() - msAgo);
    const back = (date: Date) => new Date(date.getTime() - shift);
    await prisma.shareSession.update({
      where: { id },
      data: { claimedAt: back(claimedAt as Date), expiresAt: back(expiresAt as Date) },
    });
    await prisma.accessLog.updateMany({
      where: { sessionId: id, action: 'SHARE_CLAIMED' },
      data: { at: back(claimedAt as Date) },
    });
  };
  const revoke = (id: string, who: string | null = token(awa)) =>
    call('DELETE', `/shares/${id}`, who);
  const status = (id: string, who: string | null = token(awa)) =>
    call('GET', `/shares/${id}/status`, who);
  const row = (id: string) => prisma.shareSession.findUniqueOrThrow({ where: { id } });
  const logs = (id: string) =>
    prisma.accessLog.findMany({ where: { sessionId: id }, orderBy: { at: 'asc' } });
  const actions = async (id: string) => (await logs(id)).map((l) => l.action);
  /** Code d'erreur (403/404) renvoyé par le contrôle d'accès d'une route médecin. */
  const access = async (doctor: string, id: string, options = {}) => {
    try {
      await lifecycle.requireActiveAccess(doctor, id, options);
      return 'OK';
    } catch (error) {
      const e = error as { getStatus(): number; getResponse(): { code?: string } };
      return `${e.getStatus()} ${e.getResponse().code ?? ''}`.trim();
    }
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `cycle-${id}@afyabora.test`,
      passwordHash: 'non-utilise',
      role,
      emailVerifiedAt: new Date(),
    });
    for (const [id, firstName] of [
      [awa, 'Awa'],
      [paul, 'Paul'],
    ] as const) {
      await prisma.user.create({
        data: {
          ...user(id, 'PATIENT'),
          patientProfile: {
            create: {
              firstName,
              lastName: 'Test',
              birthDate: new Date('1990-01-01'),
              sex: 'F',
              diabetesType: 'TYPE_2',
            },
          },
        },
      });
    }
    for (const [i, id] of [drA, drB].entries()) {
      await prisma.user.create({
        data: {
          ...user(id, 'DOCTOR'),
          doctorProfile: {
            create: {
              firstName: `Docteur${i}`,
              lastName: 'Test',
              licenseNumber: `TEST-${i}`,
              institution: 'Clinique de test',
              verificationStatus: 'APPROVED',
            },
          },
        },
      });
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
        {
          module: class ShareInfraModule {},
          global: true,
          providers: [
            { provide: PrismaService, useValue: prisma },
            { provide: ConfigService, useValue: { get: () => undefined } },
          ],
          exports: [PrismaService, ConfigService],
        },
        SharingModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(ClaimFailureLimiter)
      .useValue({ begin: () => () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    lifecycle = app.get(ShareLifecycleService);
    job = app.get(ShareExpiryJob);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.user.deleteMany({ where: { id: { in: [awa, paul, drA, drB] } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
  });

  describe('révocation : DELETE /shares/:id', () => {
    it('accès ouvert : 204, REVOKED, et la requête SUIVANTE du médecin est refusée (SESSION_REVOKED)', async () => {
      const id = await active();
      expect(await access(drA, id)).toBe('OK');
      const res = await revoke(id);
      const revokedAt = Date.now();
      expect(res.status).toBe(204);
      expect(await access(drA, id)).toBe('403 SESSION_REVOKED');
      expect(Date.now() - revokedAt).toBeLessThan(5000); // « révocation effective en moins de 5 s »
      const r = await row(id);
      expect(r.status).toBe('REVOKED');
      expect(r.revokedAt).not.toBeNull();
    });

    it('journal : SHARE_CLAIMED puis SHARE_REVOKED, avec le médecin concerné', async () => {
      const id = await active();
      await revoke(id);
      const entries = await logs(id);
      expect(entries.map((l) => l.action)).toEqual(['SHARE_CLAIMED', 'SHARE_REVOKED']);
      expect(entries[1]).toMatchObject({ patientId: awa, actorId: drA });
    });

    it('QR encore en attente : révoqué, son QR ne sert plus (le scan échoue)', async () => {
      const qr = await pending();
      expect((await revoke(qr.session.id)).status).toBe(204);
      const scan = await call('POST', '/shares/claim', token(drA, 'DOCTOR'), {
        token: qr.token.token,
      });
      expect(scan.status).toBe(404);
      expect(scan.body.code).toBe('TOKEN_INVALID');
      expect(
        await prisma.shareToken.count({
          where: { sessionId: qr.session.id, expiresAt: { gt: new Date() } },
        }),
      ).toBe(0);
      const entries = await logs(qr.session.id);
      expect(entries.map((l) => [l.action, l.actorId])).toEqual([['SHARE_REVOKED', null]]);
    });

    it('déjà révoquée : 204 de nouveau, rien ne change, pas de seconde ligne de journal', async () => {
      const id = await active();
      await revoke(id);
      const first = (await row(id)).revokedAt;
      expect((await revoke(id)).status).toBe(204);
      expect((await row(id)).revokedAt).toEqual(first);
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_REVOKED']);
    });

    it('accès échu mais pas encore rangé : il est EXPIRÉ (pas « arrêté »), 204', async () => {
      const id = await active();
      await makeDue(id);
      expect((await revoke(id)).status).toBe(204);
      expect((await row(id)).status).toBe('EXPIRED');
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    });

    it('session d’un AUTRE patient : 404, elle reste ouverte ; inconnue : 404 ; non UUID : 400', async () => {
      const id = await active(paul);
      const res = await revoke(id, token(awa));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session de partage introuvable.');
      expect((await row(id)).status).toBe('ACTIVE');
      expect((await revoke(randomUUID())).status).toBe(404);
      expect((await revoke('pas-un-uuid')).status).toBe(400);
    });

    it('médecin : 403 (seul le patient arrête son partage) ; sans connexion : 401', async () => {
      const id = await active();
      expect((await revoke(id, token(drA, 'DOCTOR'))).status).toBe(403);
      expect((await revoke(id, null)).status).toBe(401);
      expect((await row(id)).status).toBe('ACTIVE');
    });

    it('révocation qui attend la fin d’un scan : datée APRÈS le scan (journal dans le bon ordre)', async () => {
      const qr = await pending();
      let revoking: Promise<void> | undefined;
      // Le « scan » passe par une AUTRE connexion (un second client, comme une autre instance de l'API) :
      // avec le même client, les deux transactions passeraient l'une après l'autre et rien ne se croiserait.
      const other = new PrismaClient({ datasourceUrl: DB_URL });
      await other.$transaction(async (tx) => {
        // Un « scan » en cours tient le verrou de la session ; la révocation arrive et attend.
        await tx.$queryRaw`SELECT 1 AS l FROM "ShareSession" WHERE "id" = ${qr.session.id}::uuid FOR UPDATE`;
        revoking = lifecycle.revoke(awa, qr.session.id);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const claimedAt = new Date();
        await tx.shareSession.update({
          where: { id: qr.session.id },
          data: {
            status: 'ACTIVE',
            claimedByDoctorId: drA,
            claimedAt,
            expiresAt: new Date(claimedAt.getTime() + 30 * 60_000),
          },
        });
        await tx.accessLog.create({
          data: {
            patientId: awa,
            actorId: drA,
            sessionId: qr.session.id,
            action: 'SHARE_CLAIMED',
            at: claimedAt,
          },
        });
      });
      await other.$disconnect();
      await revoking;
      const r = await row(qr.session.id);
      expect(r.status).toBe('REVOKED');
      expect(r.revokedAt!.getTime()).toBeGreaterThanOrEqual(r.claimedAt!.getTime());
      expect(await actions(qr.session.id)).toEqual(['SHARE_CLAIMED', 'SHARE_REVOKED']);
    });

    it('révocation et scan EN MÊME TEMPS (15 fois) : jamais d’accès qui reste ouvert, journal cohérent', async () => {
      for (let i = 0; i < 15; i++) {
        const qr = await pending();
        const [revoked, scan] = await Promise.all([
          revoke(qr.session.id),
          call('POST', '/shares/claim', token(drA, 'DOCTOR'), { token: qr.token.token }),
        ]);
        expect(revoked.status).toBe(204);
        expect([200, 404]).toContain(scan.status);
        expect((await row(qr.session.id)).status).toBe('REVOKED');
        expect(await actions(qr.session.id)).toEqual(
          scan.status === 200 ? ['SHARE_CLAIMED', 'SHARE_REVOKED'] : ['SHARE_REVOKED'],
        );
      }
    });
  });

  describe('état : GET /shares/:id/status', () => {
    it('en attente : PENDING, rien d’autre', async () => {
      const qr = await pending();
      const res = await status(qr.session.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'PENDING',
        expiresAt: null,
        claimedAt: null,
        doctor: null,
        remainingSeconds: null,
      });
    });

    it('ouvert : le médecin, la fin de l’accès et les secondes restantes (horloge du serveur)', async () => {
      const id = await active();
      const res = await status(id);
      expect(shareStatusResponseSchema.parse(res.body)).toEqual(res.body);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        doctor: { firstName: 'Docteur0', lastName: 'Test', institution: 'Clinique de test' },
      });
      expect(res.body.remainingSeconds).toBeGreaterThan(30 * 60 - 5);
      expect(res.body.remainingSeconds).toBeLessThanOrEqual(30 * 60);
      expect(res.body.expiresAt).toBe((await row(id)).expiresAt?.toISOString());
    });

    it('échu : EXPIRÉ tout de suite, sans attendre la tâche ; une seule ligne SHARE_EXPIRED', async () => {
      const id = await active();
      await makeDue(id);
      for (let i = 0; i < 3; i++) {
        const res = await status(id);
        expect(res.body.status).toBe('EXPIRED');
        expect(res.body.remainingSeconds).toBeNull();
      }
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    });

    it('révoqué : REVOKED, le médecin reste affiché (« Dr X a consulté »)', async () => {
      const id = await active();
      await revoke(id);
      const res = await status(id);
      expect(res.body.status).toBe('REVOKED');
      expect(res.body.doctor).not.toBeNull();
      expect(res.body.remainingSeconds).toBeNull();
    });

    it('session d’un autre patient : 404 ; médecin : 403', async () => {
      const id = await active(paul);
      expect((await status(id, token(awa))).status).toBe(404);
      expect((await status(id, token(drA, 'DOCTOR'))).status).toBe(403);
    });
  });

  describe('tâche planifiée : ShareExpiryJob', () => {
    it('range les accès échus (EXPIRED + SHARE_EXPIRED à l’heure de fin réelle), et seulement eux', async () => {
      const due = await active();
      const due2 = await active(paul, drB);
      const running = await active(awa, drB);
      const waiting = await pending(paul);
      await makeDue(due, 90_000);
      await makeDue(due2, 1000);
      const dueEnd = (await row(due)).expiresAt;
      await job.run();
      expect((await row(due)).status).toBe('EXPIRED');
      expect((await row(due2)).status).toBe('EXPIRED');
      expect((await row(running)).status).toBe('ACTIVE');
      expect((await row(waiting.session.id)).status).toBe('PENDING');
      const expired = (await logs(due)).find((l) => l.action === 'SHARE_EXPIRED');
      expect(expired).toMatchObject({ patientId: awa, actorId: drA });
      expect(expired?.at).toEqual(dueEnd);
      expect((await logs(due2)).find((l) => l.action === 'SHARE_EXPIRED')?.actorId).toBe(drB);
    });

    it('deux passages : la seconde fois, rien à faire (pas de double journal)', async () => {
      const id = await active();
      await makeDue(id);
      await job.run();
      await job.run();
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    });

    it('tâche et requêtes EN MÊME TEMPS (10 à la fois) : une seule expiration, une seule ligne', async () => {
      const id = await active();
      await makeDue(id);
      await Promise.all([
        job.run(),
        ...Array.from({ length: 4 }, () => status(id)),
        ...Array.from({ length: 4 }, () => access(drA, id)),
        job.run(),
      ]);
      expect((await row(id)).status).toBe('EXPIRED');
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    });

    it('une session verrouillée (révocation en cours) n’est pas attendue : reprise au passage suivant', async () => {
      const id = await active();
      await makeDue(id);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS l FROM "ShareSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const started = Date.now();
        await job.run();
        expect(Date.now() - started).toBeLessThan(3000);
        expect((await tx.shareSession.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
      });
      await job.run();
      expect((await row(id)).status).toBe('EXPIRED');
    });

    it('une révocation passée avant la tâche gagne : la session reste REVOKED', async () => {
      const id = await active();
      await revoke(id);
      await makeDue(id);
      await job.run();
      expect((await row(id)).status).toBe('REVOKED');
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_REVOKED']);
    });
  });

  describe('contrôle à chaque requête : requireActiveAccess (routes médecin)', () => {
    it('accès ouvert, bon médecin : le patient, les catégories et la fin de l’accès', async () => {
      const id = await active();
      const granted = await lifecycle.requireActiveAccess(drA, id);
      expect(granted).toMatchObject({
        sessionId: id,
        patientId: awa,
        categories: ['GLUCOSE_HISTORY', 'MEALS'],
      });
      expect(granted.expiresAt).toEqual((await row(id)).expiresAt);
    });

    it('un AUTRE médecin : 403 ; session inconnue : 404 ; QR pas encore scanné : 403', async () => {
      const id = await active();
      expect(await access(drB, id)).toBe('403');
      expect(await access(drA, randomUUID())).toBe('404');
      const qr = await pending(paul);
      expect(await access(drA, qr.session.id)).toBe('403');
    });

    it('après expiration : 403 SESSION_EXPIRED même si la page est restée ouverte, et la session est rangée', async () => {
      const id = await active();
      await makeDue(id, 1);
      expect(await access(drA, id)).toBe('403 SESSION_EXPIRED');
      expect((await row(id)).status).toBe('EXPIRED');
      expect(await access(drA, id)).toBe('403 SESSION_EXPIRED');
      expect(await actions(id)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    });

    it('horloge du serveur : 1 ms avant la fin, accès ; à la fin pile, refusé', async () => {
      const id = await active();
      const end = (await row(id)).expiresAt as Date;
      expect(await access(drA, id, { now: new Date(end.getTime() - 1) })).toBe('OK');
      expect(await access(drA, id, { now: end })).toBe('403 SESSION_EXPIRED');
      // … et la session est rangée à cet instant précis, pas une seconde plus tard.
      expect((await row(id)).status).toBe('EXPIRED');
    });

    it('le contrôle d’une session ne touche QU’À elle : une autre session échue et verrouillée ne le bloque pas', async () => {
      const mine = await active();
      const other = await active(paul, drB);
      await makeDue(mine);
      await makeDue(other);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS l FROM "ShareSession" WHERE "id" = ${other}::uuid FOR UPDATE`;
        const started = Date.now();
        expect((await status(mine)).body.status).toBe('EXPIRED');
        expect(Date.now() - started).toBeLessThan(3000);
      });
      expect((await row(other)).status).toBe('ACTIVE'); // rangée par la tâche, pas par ce contrôle
    });

    it('catégorie décochée : 403 CATEGORY_NOT_SHARED ; catégorie partagée : accès', async () => {
      const id = await active(awa, drA, ['GLUCOSE_HISTORY']);
      expect(await access(drA, id, { category: 'GLUCOSE_HISTORY' })).toBe('OK');
      expect(await access(drA, id, { category: 'MEALS' })).toBe('403 CATEGORY_NOT_SHARED');
      expect(await access(drA, id, { category: 'PERSONAL_NOTES' })).toBe('403 CATEGORY_NOT_SHARED');
    });
  });
});
