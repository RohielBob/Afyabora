// Ticket L5-11 : GET /doctor/sessions (« Mes patients partagés »), sur une VRAIE base PostgreSQL : vrai serveur
// HTTP, vraies gardes, vrai Prisma, vrai calcul de qualité. Les partages sont créés et scannés par les vraies
// routes (POST /shares, POST /shares/claim).
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
import { qualityLevel } from '@glyka/analytics';
import {
  doctorSessionListSchema,
  type CreateShareResponse,
  type DoctorSessionList,
} from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { DoctorModule } from '../src/modules/doctor/doctor.module';
import { LIST_LIMIT } from '../src/modules/doctor/doctor.service';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const HOUR = 3_600_000;

describe.skipIf(!isTestDatabase(DB_URL))('L5-11 : GET /doctor/sessions (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const drA = randomUUID();
  const drB = randomUUID();
  const drPending = randomUUID();
  const everyone = [awa, paul, drA, drB, drPending];
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
  const list = async (doctor = drA) => {
    const res = await call('GET', '/doctor/sessions', token(doctor, 'DOCTOR'));
    expect(res.status).toBe(200);
    return res.body as unknown as DoctorSessionList;
  };
  /** Partage créé par le patient puis scanné par le médecin (vraies routes). */
  const opened = async (
    patient = awa,
    doctor = drA,
    categories: string[] = ['GLUCOSE_HISTORY', 'MEALS'],
  ) => {
    const qr = (await call('POST', '/shares', token(patient), { categories, duration: 'MIN_30' }))
      .body as unknown as CreateShareResponse;
    const claim = await call('POST', '/shares/claim', token(doctor, 'DOCTOR'), {
      token: qr.token.token,
    });
    expect(claim.status).toBe(200);
    return qr.session.id;
  };
  const measure = (patientId: string, hoursAgo: number, deleted = false) =>
    prisma.measurement.create({
      data: {
        id: randomUUID(),
        patientId,
        valueMgDl: 120,
        originalValue: 1.2,
        originalUnit: 'G_L',
        measuredAt: new Date(Date.now() - hoursAgo * HOUR),
        clientUpdatedAt: new Date(),
        deletedAt: deleted ? new Date() : null,
      },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `dlist-${id}@afyabora.test`,
      passwordHash: 'non-utilise',
      role,
      emailVerifiedAt: new Date(),
    });
    for (const [id, firstName, diabetesType] of [
      [awa, 'Awa', 'TYPE_1'],
      [paul, 'Paul', 'TYPE_2'],
    ] as const) {
      await prisma.user.create({
        data: {
          ...user(id, 'PATIENT'),
          patientProfile: {
            create: {
              firstName,
              lastName: 'Nomdefamille',
              birthDate: new Date('1990-01-01'),
              sex: 'F',
              diabetesType,
            },
          },
        },
      });
    }
    for (const [id, status] of [
      [drA, 'APPROVED'],
      [drB, 'APPROVED'],
      [drPending, 'PENDING'],
    ] as const) {
      await prisma.user.create({
        data: {
          ...user(id, 'DOCTOR'),
          doctorProfile: {
            create: {
              firstName: 'Docteur',
              lastName: 'Test',
              licenseNumber: 'TEST-1',
              institution: 'Clinique de test',
              verificationStatus: status,
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
          module: class DoctorInfraModule {},
          global: true,
          providers: [
            { provide: PrismaService, useValue: prisma },
            { provide: ConfigService, useValue: { get: () => undefined } },
          ],
          exports: [PrismaService, ConfigService],
        },
        SharingModule,
        DoctorModule,
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
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.user.deleteMany({ where: { id: { in: everyone } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma.measurement.deleteMany({ where: { patientId: { in: [awa, paul] } } });
  });

  it('aucun patient partagé : liste vide', async () => {
    expect(await list()).toEqual({ items: [] });
  });

  it('accès en cours : patient (prénom et type seulement), catégories, fin, dernière mesure, qualité', async () => {
    await measure(awa, 30);
    await measure(awa, 2);
    await measure(awa, 1, true); // supprimée : ne compte pas
    const id = await opened();
    const page = await list();
    expect(doctorSessionListSchema.parse(page)).toEqual(page);
    const [item] = page.items;
    expect(item).toMatchObject({
      sessionId: id,
      status: 'ACTIVE',
      categories: ['GLUCOSE_HISTORY', 'MEALS'],
      patient: { firstName: 'Awa', diabetesType: 'TYPE_1' },
    });
    expect(Object.keys(item?.patient ?? {}).sort()).toEqual(['diabetesType', 'firstName']);
    expect(JSON.stringify(page)).not.toContain('Nomdefamille');
    const last = Date.parse(item?.lastMeasurementAt ?? '');
    expect(Math.abs(last - (Date.now() - 2 * HOUR))).toBeLessThan(60_000);
    expect(item?.quality).not.toBeNull();
    expect(item?.quality?.level).toBe(qualityLevel(item?.quality?.score ?? -1));
    const row = await prisma.shareSession.findUniqueOrThrow({ where: { id } });
    expect(item?.expiresAt).toBe(row.expiresAt?.toISOString());
    expect(item?.claimedAt).toBe(row.claimedAt?.toISOString());
  });

  it('historique glycémique NON partagé : ni dernière mesure ni qualité', async () => {
    await measure(awa, 2);
    await opened(awa, drA, ['MEALS', 'TREATMENTS']);
    const [item] = (await list()).items;
    expect(item).toMatchObject({ status: 'ACTIVE', lastMeasurementAt: null, quality: null });
  });

  it('accès terminé (arrêté par le patient) : visible, mais plus aucune donnée de santé', async () => {
    await measure(awa, 2);
    const id = await opened();
    await call('DELETE', `/shares/${id}`, token(awa));
    const [item] = (await list()).items;
    expect(item).toMatchObject({
      sessionId: id,
      status: 'REVOKED',
      lastMeasurementAt: null,
      quality: null,
    });
  });

  it('accès échu mais pas encore rangé : affiché EXPIRÉ (jamais « en cours »), rangé en base', async () => {
    await measure(awa, 2);
    const id = await opened();
    await prisma.shareSession.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const [item] = (await list()).items;
    expect(item).toMatchObject({ status: 'EXPIRED', lastMeasurementAt: null, quality: null });
    expect((await prisma.shareSession.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect(
      await prisma.accessLog.count({ where: { sessionId: id, action: 'SHARE_EXPIRED' } }),
    ).toBe(1);
  });

  it('seulement les sessions de CE médecin ; un QR pas encore scanné n’apparaît pas', async () => {
    await opened(paul, drB);
    await call('POST', '/shares', token(awa), { categories: ['MEALS'], duration: 'MIN_5' });
    expect(await list(drA)).toEqual({ items: [] });
    expect((await list(drB)).items.map((i) => i.patient.firstName)).toEqual(['Paul']);
  });

  it('accès en cours d’abord, puis du plus récent au plus ancien', async () => {
    const old = await opened(awa, drA);
    await call('DELETE', `/shares/${old}`, token(awa));
    const recentEnded = await opened(paul, drA);
    await call('DELETE', `/shares/${recentEnded}`, token(paul));
    const current = await opened(awa, drA);
    // L'accès en cours a été scanné en dernier ; on le recule pour vérifier qu'il reste en tête.
    await prisma.shareSession.update({
      where: { id: current },
      data: { claimedAt: new Date(Date.now() - 10 * HOUR) },
    });
    expect((await list()).items.map((i) => i.sessionId)).toEqual([current, recentEnded, old]);
  });

  it(`${LIST_LIMIT} sessions au plus`, async () => {
    await prisma.shareSession.createMany({
      data: Array.from({ length: LIST_LIMIT + 1 }, (_, i) => ({
        patientId: awa,
        categories: ['MEALS'],
        duration: 'MIN_5',
        status: 'EXPIRED' as const,
        claimedByDoctorId: drA,
        claimedAt: new Date(Date.now() - (i + 1) * HOUR),
        expiresAt: new Date(Date.now() - i * HOUR),
      })),
    });
    expect((await list()).items).toHaveLength(LIST_LIMIT);
  });

  it('médecin en attente : 403 DOCTOR_NOT_APPROVED ; patient : 403 ; sans connexion : 401 ; compte supprimé : 401', async () => {
    const pending = await call('GET', '/doctor/sessions', token(drPending, 'DOCTOR'));
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('DOCTOR_NOT_APPROVED');
    const asPatient = await call('GET', '/doctor/sessions', token(awa));
    expect(asPatient.status).toBe(403);
    expect(asPatient.body.code).toBeUndefined(); // refusé par le rôle, avant même le service
    expect((await call('GET', '/doctor/sessions', null)).status).toBe(401);
    expect((await call('GET', '/doctor/sessions', token(randomUUID(), 'DOCTOR'))).status).toBe(401);
  });

  it('la liste n’écrit rien dans le journal du patient (elle ne lit pas le dossier)', async () => {
    const id = await opened();
    const before = await prisma.accessLog.count({ where: { sessionId: id } });
    await list();
    await list();
    expect(await prisma.accessLog.count({ where: { sessionId: id } })).toBe(before);
  });
});
