// Ticket L5-03 : POST /shares/claim (scan du QR par un médecin approuvé), sur une VRAIE base PostgreSQL :
// vrai serveur HTTP, vraies gardes JWT et rôles, vrai Prisma. Le patient crée son QR par la vraie route
// (POST /shares), le médecin le scanne par la vraie route : c'est le parcours de la démo.
// Ne tourne que sur une base « …_test » (test/support/test-database.ts).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  claimShareResponseSchema,
  SHARE_DURATION_MINUTES,
  type CreateShareResponse,
} from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const INVALID = { message: 'QR invalide ou expiré', code: 'TOKEN_INVALID' };

describe.skipIf(!isTestDatabase(DB_URL))('L5-03 : POST /shares/claim (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let limited: INestApplication;
  let baseUrl: string;
  let limitedUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  /** Médecins approuvés : le premier sert partout, les autres pour les scans simultanés. */
  const doctors = Array.from({ length: 10 }, () => randomUUID());
  const [drA, drB] = doctors as [string, string];
  const drBloque = randomUUID(); // approuvé, réservé au test du blocage
  const drEnAttente = randomUUID();
  const drRefuse = randomUUID();
  const everyone = [awa, ...doctors, drBloque, drEnAttente, drRefuse];
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });
  const doc = (sub: string) => token(sub, 'DOCTOR');

  const call = async (
    method: string,
    path: string,
    who: string | null,
    body?: unknown,
    url = baseUrl,
  ) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: res.status,
      headers: res.headers,
      body: (await res.json()) as Record<string, unknown>,
    };
  };
  const share = async (duration = 'MIN_30', url = baseUrl) => {
    const res = await call(
      'POST',
      '/shares',
      token(awa),
      { categories: ['MEALS', 'GLUCOSE_HISTORY'], duration },
      url,
    );
    expect(res.status).toBe(201);
    return res.body as unknown as CreateShareResponse;
  };
  const claim = (qr: unknown, who: string | null = doc(drA), url = baseUrl) =>
    call('POST', '/shares/claim', who, { token: qr }, url);
  const session = (id: string) => prisma.shareSession.findUniqueOrThrow({ where: { id } });

  /**
   * Application de test. `limits` : avec la limite de débit ET le blocage après 5 scans ratés. Sans, le
   * blocage est neutralisé : tous les scans viennent de 127.0.0.1, les scans ratés des autres scénarios
   * finiraient par bloquer celui-ci.
   */
  const build = async (limits: boolean) => {
    let builder = Test.createTestingModule({
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
        ...(limits ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }] : []),
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    });
    if (!limits) {
      builder = builder
        .overrideProvider(ClaimFailureLimiter)
        .useValue({ begin: () => () => undefined });
    }
    const nest = (await builder.compile()).createNestApplication();
    nest.useGlobalFilters(new AllExceptionsFilter());
    await nest.listen(0, '127.0.0.1');
    return {
      nest,
      url: `http://127.0.0.1:${(nest.getHttpServer().address() as AddressInfo).port}`,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `claim-${id}@afyabora.test`,
      passwordHash: 'non-utilise',
      role,
      emailVerifiedAt: new Date(),
    });
    const doctor = (id: string, status: 'APPROVED' | 'PENDING' | 'REJECTED', n: number) =>
      prisma.user.create({
        data: {
          ...user(id, 'DOCTOR'),
          doctorProfile: {
            create: {
              firstName: `Médecin${n}`,
              lastName: 'Test',
              licenseNumber: `TEST-${n}`,
              institution: 'Clinique de test',
              verificationStatus: status,
            },
          },
        },
      });
    await prisma.user.create({
      data: {
        ...user(awa, 'PATIENT'),
        patientProfile: {
          create: {
            firstName: 'Awa',
            lastName: 'Nomdefamille',
            birthDate: new Date('1990-01-01'),
            sex: 'F',
            diabetesType: 'TYPE_1',
          },
        },
      },
    });
    for (const [i, id] of doctors.entries()) await doctor(id, 'APPROVED', i);
    await doctor(drBloque, 'APPROVED', 90);
    await doctor(drEnAttente, 'PENDING', 91);
    await doctor(drRefuse, 'REJECTED', 92);
    ({ nest: app, url: baseUrl } = await build(false));
    ({ nest: limited, url: limitedUrl } = await build(true));
  });

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await prisma?.accessLog.deleteMany({ where: { patientId: awa } });
    await prisma?.shareSession.deleteMany({ where: { patientId: awa } });
    await prisma?.user.deleteMany({ where: { id: { in: everyone } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: awa } });
    await prisma.shareSession.deleteMany({ where: { patientId: awa } });
  });

  describe('scan réussi', () => {
    it('200 : accès ouvert, au format du contrat ; du patient, seulement le prénom et le type', async () => {
      const qr = await share();
      const before = Date.now();
      const res = await claim(qr.token.token);
      expect(res.status).toBe(200);
      expect(claimShareResponseSchema.parse(res.body)).toEqual(res.body);
      expect(res.body).toMatchObject({
        sessionId: qr.session.id,
        categories: ['GLUCOSE_HISTORY', 'MEALS'],
        patient: { firstName: 'Awa', diabetesType: 'TYPE_1' },
      });
      expect(Object.keys(res.body.patient as object).sort()).toEqual(['diabetesType', 'firstName']);
      expect(JSON.stringify(res.body)).not.toContain('Nomdefamille');
      const lasts = Date.parse(String(res.body.expiresAt)) - before;
      expect(lasts).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
      expect(lasts).toBeLessThanOrEqual(30 * 60_000 + 2000);
    });

    it('en base : session ACTIVE, rattachée à ce médecin, la durée démarre au scan', async () => {
      const qr = await share();
      const res = await claim(qr.token.token);
      const row = await session(qr.session.id);
      expect(row.status).toBe('ACTIVE');
      expect(row.claimedByDoctorId).toBe(drA);
      expect(row.claimedAt).not.toBeNull();
      expect(row.expiresAt?.toISOString()).toBe(res.body.expiresAt);
      expect((row.expiresAt?.getTime() ?? 0) - (row.claimedAt?.getTime() ?? 0)).toBe(30 * 60_000);
    });

    it.each(['MIN_5', 'MIN_30', 'HOUR_1', 'CONSULTATION'] as const)(
      'durée %s : fin de l’accès = scan + durée (Consultation : 2 h)',
      async (duration) => {
        const qr = await share(duration);
        await claim(qr.token.token);
        const row = await session(qr.session.id);
        expect((row.expiresAt?.getTime() ?? 0) - (row.claimedAt?.getTime() ?? 0)).toBe(
          SHARE_DURATION_MINUTES[duration] * 60_000,
        );
      },
    );

    it('seules les catégories choisies par CE patient sont renvoyées', async () => {
      const res = await call('POST', '/shares', token(awa), {
        categories: ['ACTIVITY'],
        duration: 'MIN_5',
      });
      const qr = res.body as unknown as CreateShareResponse;
      expect((await claim(qr.token.token)).body.categories).toEqual(['ACTIVITY']);
    });

    it('le scan est écrit dans le journal d’accès du patient (SHARE_CLAIMED), sans le jeton', async () => {
      const qr = await share();
      await claim(qr.token.token);
      const logs = await prisma.accessLog.findMany({ where: { patientId: awa } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'SHARE_CLAIMED',
        actorId: drA,
        sessionId: qr.session.id,
      });
      expect(logs[0]?.ip).toMatch(/127\.0\.0\.1/);
      expect(JSON.stringify(logs[0])).not.toContain(qr.token.token);
    });

    it('après le scan : plus de rotation (409) ; un nouveau QR du patient ne coupe pas cet accès', async () => {
      const qr = await share();
      await claim(qr.token.token);
      const rotation = await call('GET', `/shares/${qr.session.id}/token`, token(awa));
      expect(rotation.status).toBe(409);
      expect(rotation.body.code).toBe('SESSION_NOT_PENDING');
      await share();
      expect((await session(qr.session.id)).status).toBe('ACTIVE');
    });
  });

  describe('usage unique', () => {
    it('même QR scanné deux fois : le second est refusé (404 TOKEN_INVALID), l’accès reste au premier', async () => {
      const qr = await share();
      expect((await claim(qr.token.token, doc(drA))).status).toBe(200);
      const second = await claim(qr.token.token, doc(drB));
      expect(second.status).toBe(404);
      expect(second.body).toMatchObject(INVALID);
      expect((await session(qr.session.id)).claimedByDoctorId).toBe(drA);
      expect(await prisma.accessLog.count({ where: { patientId: awa } })).toBe(1);
    });

    it('jeton de plus de 60 s refusé, et la session reste en attente', async () => {
      const qr = await share();
      await prisma.shareToken.updateMany({
        where: { sessionId: qr.session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await claim(qr.token.token);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject(INVALID);
      expect((await session(qr.session.id)).status).toBe('PENDING');
    });

    it('jeton remplacé par une rotation : refusé ; le nouveau QR fonctionne', async () => {
      const qr = await share();
      const next = await call('GET', `/shares/${qr.session.id}/token`, token(awa));
      expect((await claim(qr.token.token)).status).toBe(404);
      expect((await claim(next.body.token)).status).toBe(200);
    });

    it('deux médecins scannent EN MÊME TEMPS (10 à la fois) : un seul réussit, une seule trace', async () => {
      const qr = await share();
      const results = await Promise.all(doctors.map((id) => claim(qr.token.token, doc(id))));
      const winners = results.filter((r) => r.status === 200);
      expect(winners).toHaveLength(1);
      expect(results.filter((r) => r.status === 404)).toHaveLength(9);
      const winner = doctors[results.findIndex((r) => r.status === 200)];
      expect((await session(qr.session.id)).claimedByDoctorId).toBe(winner);
      expect(await prisma.accessLog.count({ where: { patientId: awa } })).toBe(1);
    });

    it.each(['EXPIRED', 'REVOKED'] as const)(
      'session %s : même réponse 404 TOKEN_INVALID, sans préciser pourquoi',
      async (status) => {
        const qr = await share();
        await prisma.shareSession.update({ where: { id: qr.session.id }, data: { status } });
        const res = await claim(qr.token.token);
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject(INVALID);
        expect((await session(qr.session.id)).status).toBe(status);
      },
    );

    it('jeton inconnu (bien formé) ou mal formé : 404 TOKEN_INVALID', async () => {
      expect((await claim('Z'.repeat(43))).body).toMatchObject(INVALID);
      expect((await claim('ceci-n-est-pas-un-jeton-afyabora')).body).toMatchObject(INVALID);
    });
  });

  describe('qui peut scanner', () => {
    it.each([
      ['en attente', () => drEnAttente],
      ['refusé', () => drRefuse],
    ])(
      'médecin %s : 403 DOCTOR_NOT_APPROVED, et le QR du patient n’est PAS consommé',
      async (_label, who) => {
        const qr = await share();
        const res = await claim(qr.token.token, doc(who()));
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('DOCTOR_NOT_APPROVED');
        expect(res.body.message).toBe(
          "Votre compte médecin n'est pas encore approuvé : vous ne pouvez pas encore consulter de dossier.",
        );
        expect((await session(qr.session.id)).status).toBe('PENDING');
        expect((await claim(qr.token.token)).status).toBe(200);
      },
    );

    it('patient : 403 (rôle) ; sans connexion : 401 ; compte médecin supprimé : 401', async () => {
      const qr = await share();
      const asPatient = await claim(qr.token.token, token(awa));
      expect(asPatient.status).toBe(403);
      expect(asPatient.body.code).toBeUndefined(); // refusé par le rôle, avant même le service
      expect((await claim(qr.token.token, null)).status).toBe(401);
      expect((await claim(qr.token.token, doc(randomUUID()))).status).toBe(401);
      expect((await session(qr.session.id)).status).toBe('PENDING');
    });

    it.each([[{}], [{ token: 'court' }], [{ token: 'x'.repeat(201) }], [{ token: 42 }]])(
      'corps invalide %j : 400 sur « token »',
      async (body) => {
        const res = await call('POST', '/shares/claim', doc(drA), body);
        expect(res.status).toBe(400);
        expect((res.body.issues as { path: string }[]).map((i) => i.path)).toContain('token');
      },
    );
  });

  describe('blocage après des scans ratés', () => {
    it('les scans RÉUSSIS ne comptent pas : 6 patients scannés de suite, jamais bloqué', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const qr = await share('MIN_5', limitedUrl);
        statuses.push((await claim(qr.token.token, doc(drB), limitedUrl)).status);
      }
      expect(statuses).toEqual(Array(6).fill(200));
    });

    it('5 scans ratés : le 6e est bloqué (429 + Retry-After) MÊME avec un bon QR, qui n’est pas consommé', async () => {
      const qr = await share('MIN_30', limitedUrl);
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await claim('Z'.repeat(43), doc(drBloque), limitedUrl)).status);
      }
      expect(statuses).toEqual(Array(5).fill(404));
      const blocked = await claim(qr.token.token, doc(drBloque), limitedUrl);
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toBe(
        'Trop de QR invalides scannés. Patientez une minute avant de réessayer.',
      );
      const wait = Number(blocked.headers.get('retry-after'));
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(60);
      expect(blocked.body.retryAfterSeconds).toBe(wait);
      expect((await session(qr.session.id)).status).toBe('PENDING');
    });
  });
});
