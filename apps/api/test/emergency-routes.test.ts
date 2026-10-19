// Ticket L6-05 : carte d'urgence (GET/PUT /emergency, POST /emergency/regenerate, page publique GET /e/:token)
// sur une VRAIE base PostgreSQL : vrai serveur HTTP, vraies gardes, vrai Prisma.
// Tests obligatoires du README : QR désactivé = 404 ; aucune donnée d'historique ; ouverture notifiée.
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
  emergencyCardPublicSchema,
  emergencyCardResponseSchema,
  emergencyQrResponseSchema,
  type AccessLogList,
} from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { hashEmergencyToken } from '../src/modules/emergency/emergency-card';
import { EmergencyModule } from '../src/modules/emergency/emergency.module';
import { EmergencyService } from '../src/modules/emergency/emergency.service';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const PORTAL = 'https://portail.afyabora.test';
const MINUTE = 60_000;

/** Carte complète, comme la remplirait le patient. */
const FULL = {
  fullName: 'Awa Mbuyi',
  diabetesType: 'Type 1',
  declaredTreatment: 'Insuline rapide et lente',
  allergies: 'Pénicilline',
  bloodGroup: 'O+',
  lastKnownGlucoseMgDl: 132,
  emergencyContactName: 'Marie Mbuyi',
  emergencyContactPhone: '+243810000000',
  enabled: true,
} as const;

describe.skipIf(!isTestDatabase(DB_URL))('L6-05 : carte d’urgence (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let limited: INestApplication;
  let baseUrl: string;
  let limitedUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const noProfile = randomUUID();
  const doctor = randomUUID();
  const everyone = [awa, paul, noProfile, doctor];
  const patients = [awa, paul];
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

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
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
    };
  };
  const save = (body: unknown, who = awa) => call('PUT', '/emergency', token(who), body);
  const regenerate = async (who = awa) => {
    const res = await call('POST', '/emergency/regenerate', token(who));
    expect(res.status).toBe(200);
    return emergencyQrResponseSchema.parse(res.body);
  };
  const open = (qrToken: string, url = baseUrl) =>
    call('GET', `/e/${qrToken}`, null, undefined, url);
  const viewed = (patientId = awa) =>
    prisma.accessLog.findMany({
      where: { patientId, action: 'EMERGENCY_VIEWED' },
      orderBy: { at: 'asc' },
    });
  const notifications = (userId = awa) =>
    prisma.notificationOutbox.findMany({ where: { userId }, orderBy: { scheduledAt: 'asc' } });

  /** Serveur de test ; `withLimits` : avec les vraies limites de débit (ThrottlerGuard). */
  const build = async (withLimits: boolean) => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        ThrottlerModule.forRoot([{ ttl: MINUTE, limit: 1000 }]),
        {
          module: class EmergencyInfraModule {},
          global: true,
          providers: [
            { provide: PrismaService, useValue: prisma },
            {
              provide: ConfigService,
              useValue: { get: (key: string) => (key === 'PORTAL_URL' ? PORTAL : undefined) },
            },
          ],
          exports: [PrismaService, ConfigService],
        },
        EmergencyModule,
        SharingModule, // journal du patient (GET /shares/log)
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        ...(withLimits ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }] : []),
      ],
    })
      .overrideProvider(ClaimFailureLimiter)
      .useValue({ begin: () => () => undefined })
      .compile();
    const instance = moduleRef.createNestApplication();
    instance.useGlobalFilters(new AllExceptionsFilter());
    await instance.listen(0, '127.0.0.1');
    return {
      instance,
      url: `http://127.0.0.1:${(instance.getHttpServer().address() as AddressInfo).port}`,
      service: moduleRef.get(EmergencyService),
    };
  };
  let service: EmergencyService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `urg-${id}@afyabora.test`,
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
              lastName: 'Mbuyi',
              birthDate: new Date('1990-01-01'),
              sex: 'F',
              diabetesType: 'TYPE_1',
            },
          },
        },
      });
    }
    await prisma.user.create({ data: user(noProfile, 'PATIENT') });
    await prisma.user.create({ data: user(doctor, 'DOCTOR') });
    ({ instance: app, url: baseUrl, service } = await build(false));
    ({ instance: limited, url: limitedUrl } = await build(true));
  });

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await prisma?.notificationOutbox.deleteMany({ where: { userId: { in: everyone } } });
    await prisma?.user.deleteMany({ where: { id: { in: everyone } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: { in: patients } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: everyone } } });
    await prisma.emergencyCard.deleteMany({ where: { patientId: { in: patients } } });
    await prisma.measurement.deleteMany({ where: { patientId: { in: patients } } });
  });

  // ------------------------------------------------------------------ carte du patient

  describe('GET / PUT /emergency (patient)', () => {
    it('première lecture : carte vide, désactivée, sans QR', async () => {
      const res = await call('GET', '/emergency', token(awa));
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.body).toEqual({ enabled: false, qrActive: false, updatedAt: expect.any(String) });
      expect(emergencyCardResponseSchema.parse(res.body)).toBeTruthy();
    });

    it('enregistrer : les champs choisis ; un champ vide est effacé ; relu tel quel', async () => {
      const saved = await save({ ...FULL, allergies: '  ' });
      expect(saved.status).toBe(200);
      const { allergies: _none, ...rest } = FULL;
      expect(saved.body).toMatchObject({ ...rest, qrActive: false });
      expect(saved.body).not.toHaveProperty('allergies');
      expect((await call('GET', '/emergency', token(awa))).body).toEqual(saved.body);
      // Remplacement complet : un champ absent de la nouvelle carte disparaît.
      const smaller = await save({ fullName: 'Awa', enabled: false });
      expect(smaller.body).toEqual({
        fullName: 'Awa',
        enabled: false,
        qrActive: false,
        updatedAt: expect.any(String),
      });
    });

    it.each([
      ['groupe sanguin inconnu', { bloodGroup: 'Z+' }],
      ['glycémie hors bornes', { lastKnownGlucoseMgDl: 700 }],
      ['glycémie non entière', { lastKnownGlucoseMgDl: 120.5 }],
      ['nom trop long', { fullName: 'x'.repeat(121) }],
      ['« activée » qui n’est pas un booléen', { enabled: 'oui' }],
    ])('400 : %s', async (_cas, body) => {
      expect((await save(body)).status).toBe(400);
    });

    it('rôle et propriété : médecin 403, sans jeton 401, sans profil 404 ; chacun sa carte', async () => {
      expect((await call('GET', '/emergency', token(doctor, 'DOCTOR'))).status).toBe(403);
      expect((await call('PUT', '/emergency', token(doctor, 'DOCTOR'), FULL)).status).toBe(403);
      expect((await call('POST', '/emergency/regenerate', token(doctor, 'DOCTOR'))).status).toBe(
        403,
      );
      expect((await call('GET', '/emergency', null)).status).toBe(401);
      expect((await call('GET', '/emergency', token(noProfile))).status).toBe(404);
      await save(FULL, awa);
      expect((await call('GET', '/emergency', token(paul))).body).not.toHaveProperty('fullName');
    });
  });

  // ------------------------------------------------------------------ QR

  describe('POST /emergency/regenerate', () => {
    it('jeton montré une fois, adresse du portail ; seul le hash est en base', async () => {
      const qr = await regenerate();
      expect(qr.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(qr.url).toBe(`${PORTAL}/e/${qr.token}`);
      const row = await prisma.emergencyCard.findUniqueOrThrow({ where: { patientId: awa } });
      expect(row.tokenHash).toBe(hashEmergencyToken(qr.token));
      expect(JSON.stringify(row)).not.toContain(qr.token);
      expect((await call('GET', '/emergency', token(awa))).body).toMatchObject({ qrActive: true });
      expect(JSON.stringify((await call('GET', '/emergency', token(awa))).body)).not.toContain(
        qr.token,
      );
    });

    it('ne change pas l’état « activée » de la carte', async () => {
      await save({ ...FULL, enabled: false });
      await regenerate();
      expect((await call('GET', '/emergency', token(awa))).body).toMatchObject({ enabled: false });
    });
  });

  // ------------------------------------------------------------------ page publique

  describe('GET /e/:token (page publique)', () => {
    it('carte activée : UNIQUEMENT les champs choisis, sans compte, jamais en cache ni indexée', async () => {
      await save(FULL);
      const qr = await regenerate();
      const res = await open(qr.token);
      expect(res.status).toBe(200);
      const { enabled: _e, ...shown } = FULL;
      expect(res.body).toEqual({ ...shown, updatedAt: expect.any(String) });
      expect(emergencyCardPublicSchema.parse(res.body)).toBeTruthy();
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('AUCUNE donnée d’historique : les mesures du patient n’apparaissent jamais', async () => {
      await prisma.measurement.create({
        data: {
          id: randomUUID(),
          patientId: awa,
          valueMgDl: 287,
          originalValue: 2.87,
          originalUnit: 'G_L',
          measuredAt: new Date(),
          context: 'AFTER_MEAL',
          source: 'MANUAL',
          clientUpdatedAt: new Date(),
        },
      });
      await save({ fullName: 'Awa', enabled: true });
      const res = await open((await regenerate()).token);
      expect(res.body).toEqual({ fullName: 'Awa', updatedAt: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/287|2\.87|AFTER_MEAL|measure/i);
    });

    it('carte DÉSACTIVÉE : 404 immédiatement ; réactivée : le même QR remarche', async () => {
      await save(FULL);
      const qr = await regenerate();
      expect((await open(qr.token)).status).toBe(200);
      await save({ ...FULL, enabled: false });
      const off = await open(qr.token);
      expect(off.status).toBe(404);
      expect(JSON.stringify(off.body)).not.toContain('Awa');
      await save(FULL);
      expect((await open(qr.token)).status).toBe(200);
    });

    it('QR RÉGÉNÉRÉ : l’ancien donne 404 immédiatement, le nouveau marche', async () => {
      await save(FULL);
      const first = await regenerate();
      const second = await regenerate();
      expect((await open(first.token)).status).toBe(404);
      expect((await open(second.token)).status).toBe(200);
    });

    it('carte activée mais jamais de QR, jeton inconnu ou mal formé : 404, même message', async () => {
      await save(FULL);
      const unknown = await open('A'.repeat(43));
      const malformed = await open('pas-un-jeton');
      expect(unknown.status).toBe(404);
      expect(malformed.status).toBe(404);
      expect(unknown.body.message).toBe(malformed.body.message);
      expect(await viewed()).toEqual([]);
      // Un texte qui n'a pas la forme d'un jeton n'est même pas cherché en base.
      const spy = vi.spyOn(prisma, '$transaction');
      await expect(service.readPublic('pas-un-jeton')).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('chaque ouverture est JOURNALISÉE (sans médecin) et visible par le patient', async () => {
      await save(FULL);
      const qr = await regenerate();
      await open(qr.token);
      await open(qr.token);
      const lines = await viewed();
      expect(lines).toHaveLength(2); // jamais regroupées
      expect(lines[0]).toMatchObject({ actorId: null, sessionId: null });
      expect(lines[0]?.ip).toBeTruthy();
      const log = (await call('GET', '/shares/log', token(awa))).body as unknown as AccessLogList;
      expect(log.items.filter((item) => item.action === 'EMERGENCY_VIEWED')).toHaveLength(2);
      expect(JSON.stringify(log)).not.toContain('"ip"');
      expect(await viewed(paul)).toEqual([]);
    });

    it('ouverture NOTIFIÉE au patient (file d’envoi), sans donnée de santé ; une seule par 5 min', async () => {
      await save(FULL);
      const qr = await regenerate();
      await open(qr.token);
      await open(qr.token);
      const queued = await notifications();
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ category: 'EMERGENCY_ACCESS', status: 'PENDING' });
      expect(`${queued[0]?.title} ${queued[0]?.body}`).not.toMatch(/\d|Awa|O\+|Insuline/);
      expect(await notifications(paul)).toEqual([]);
      // 6 minutes plus tard : nouvelle notification.
      await service.readPublic(qr.token, '127.0.0.1', new Date(Date.now() + 6 * MINUTE));
      expect(await notifications()).toHaveLength(2);
      expect(await viewed()).toHaveLength(3);
    });

    it('carte désactivée : ni journal ni notification', async () => {
      await save({ ...FULL, enabled: false });
      await open((await regenerate()).token);
      expect(await viewed()).toEqual([]);
      expect(await notifications()).toEqual([]);
    });

    it('désactivation AU MÊME INSTANT qu’une ouverture : la lecture attend le verrou, puis 404', async () => {
      await save(FULL);
      const qr = await regenerate();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      // Le patient désactive sa carte : sa transaction tient le verrou de la carte.
      const disabling = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "EmergencyCard" WHERE "patientId" = ${awa}::uuid FOR UPDATE`;
          await held;
          await tx.emergencyCard.update({ where: { patientId: awa }, data: { enabled: false } });
        },
        { maxWait: 10_000, timeout: 15_000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      // Un secouriste ouvre la carte pendant ce temps : il doit attendre la fin de la désactivation.
      let answered = false;
      const reading = open(qr.token).finally(() => (answered = true));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(answered).toBe(false);
      release();
      await disabling;
      expect((await reading).status).toBe(404); // lue APRÈS la désactivation : rien ne sort
      expect(await viewed()).toEqual([]);
      expect(await notifications()).toEqual([]);
    });

    it('ouvertures simultanées : chacune journalisée, UNE seule notification', async () => {
      await save(FULL);
      const qr = await regenerate();
      const results = await Promise.all(Array.from({ length: 20 }, () => open(qr.token)));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
      expect(await viewed()).toHaveLength(20);
      expect(await notifications()).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ limite de débit

  describe('limitation de débit (serveur avec les vraies limites)', () => {
    it('/e/:token : 10 ouvertures par minute et par adresse, la 11e est refusée (429)', async () => {
      await save(FULL);
      const qr = await regenerate();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push((await open(qr.token, limitedUrl)).status);
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
      // Jetons essayés au hasard : arrêtés de la même façon.
      expect((await open('B'.repeat(43), limitedUrl)).status).toBe(429);
    });

    it('régénération : 10 par minute au plus', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await call('POST', '/emergency/regenerate', token(paul), undefined, limitedUrl)).status,
        );
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
    });
  });
});
