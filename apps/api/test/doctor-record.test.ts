// Ticket L5-12 : dossier partagé lu par le médecin (GET /doctor/sessions/:id/summary, /measurements,
// /timeline), sur une VRAIE base PostgreSQL : vrai serveur HTTP, vraies gardes, vrai Prisma, vrai moteur
// d'analyse. Les partages sont créés et scannés par les vraies routes (POST /shares, POST /shares/claim).
// Ne tourne que sur une base « …_test » (test/support/test-database.ts).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  doctorSummarySchema,
  measurementListSchema,
  timelineListSchema,
  type CreateShareResponse,
  type DoctorSummary,
  type MeasurementListDto,
  type TimelineList,
} from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { DoctorModule } from '../src/modules/doctor/doctor.module';
import { VIEW_LOG_WINDOW_MS } from '../src/modules/doctor/record-view';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const KEY = randomBytes(32).toString('base64');
const HOUR = 3_600_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Route = 'summary' | 'measurements' | 'timeline';

describe.skipIf(!isTestDatabase(DB_URL))(
  'L5-12 : dossier partagé lu par le médecin (vraie base)',
  () => {
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
    const patients = [awa, paul];
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
      return {
        status: res.status,
        body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
      };
    };
    /** Lecture d'une route du dossier par un médecin (drA par défaut). */
    const read = (route: Route, id: string, query = '', doctor = drA) =>
      call('GET', `/doctor/sessions/${id}/${route}${query}`, token(doctor, 'DOCTOR'));
    const ok = async <T>(route: Route, id: string, query = '') => {
      const res = await read(route, id, query);
      expect(res.status).toBe(200);
      return res.body as unknown as T;
    };
    /** Partage créé par le patient puis scanné par le médecin (vraies routes). */
    const opened = async (categories: string[], patient = awa, doctor = drA) => {
      const qr = (await call('POST', '/shares', token(patient), { categories, duration: 'MIN_30' }))
        .body as unknown as CreateShareResponse;
      const claim = await call('POST', '/shares/claim', token(doctor, 'DOCTOR'), {
        token: qr.token.token,
      });
      expect(claim.status).toBe(200);
      return qr.session.id;
    };
    const measure = (
      patientId: string,
      hoursAgo: number,
      options: { mgDl?: number; note?: string; deleted?: boolean; id?: string } = {},
    ) =>
      prisma.measurement.create({
        data: {
          id: options.id ?? randomUUID(),
          patientId,
          valueMgDl: options.mgDl ?? 120,
          originalValue: (options.mgDl ?? 120) / 100,
          originalUnit: 'G_L',
          measuredAt: new Date(Date.now() - hoursAgo * HOUR),
          context: 'FASTING',
          noteEncrypted: options.note ? encryptField(options.note, KEY) : null,
          clientUpdatedAt: new Date(),
          deletedAt: options.deleted ? new Date() : null,
        },
      });
    const event = (
      patientId: string,
      type: 'MEAL' | 'ACTIVITY' | 'TREATMENT',
      label: string,
      hoursAgo: number,
      id = randomUUID(),
      durationMinutes: number | null = null,
    ) =>
      prisma.lifeEvent.create({
        data: {
          id,
          patientId,
          type,
          label,
          occurredAt: new Date(Date.now() - hoursAgo * HOUR),
          detailsEncrypted: encryptField('détail privé', KEY),
          durationMinutes,
          clientUpdatedAt: new Date(),
        },
      });
    const views = (sessionId: string) =>
      prisma.accessLog.findMany({
        where: { sessionId, action: 'SHARE_VIEWED' },
        orderBy: { at: 'asc' },
      });

    beforeAll(async () => {
      prisma = new PrismaClient({ datasourceUrl: DB_URL });
      const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
        id,
        email: `drec-${id}@afyabora.test`,
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
                lastName: 'Nomdefamille',
                birthDate: new Date('1990-01-01'),
                sex: 'F',
                diabetesType: 'TYPE_1',
                diagnosisYear: 2015,
                preferredUnit: 'MMOL_L',
                // Seuils PERSONNELS (différents des valeurs par défaut) : l'état des mesures doit les suivre.
                veryLowMgDl: 60,
                targetMinMgDl: 80,
                targetMaxMgDl: 160,
                veryHighMgDl: 240,
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
      const config = (key: string) => (key === 'FIELD_ENCRYPTION_KEY' ? KEY : undefined);
      const moduleRef = await Test.createTestingModule({
        imports: [
          JwtModule.register({ global: true, secret: SECRET }),
          ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
          {
            module: class RecordInfraModule {},
            global: true,
            providers: [
              { provide: PrismaService, useValue: prisma },
              { provide: ConfigService, useValue: { get: config, getOrThrow: config } },
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
      await prisma?.accessLog.deleteMany({ where: { patientId: { in: patients } } });
      await prisma?.shareSession.deleteMany({ where: { patientId: { in: patients } } });
      await prisma?.user.deleteMany({ where: { id: { in: everyone } } });
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      await prisma.accessLog.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.shareSession.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.measurement.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.lifeEvent.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.doctorProfile.update({
        where: { userId: drA },
        data: { verificationStatus: 'APPROVED' },
      });
    });

    // ------------------------------------------------------------------ contrôle à chaque requête

    describe('contrôle d’accès, à chaque requête', () => {
      const routes: Route[] = ['summary', 'measurements', 'timeline'];
      const ALL = ['GLUCOSE_HISTORY', 'MEALS', 'ACTIVITY', 'TREATMENTS', 'AI_SUMMARY'];

      it('403 après expiration, même si la page est encore ouverte ; la session est expirée en base', async () => {
        const id = await opened(ALL);
        for (const route of routes) expect((await read(route, id)).status).toBe(200);
        await prisma.shareSession.update({
          where: { id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        for (const route of routes) {
          const res = await read(route, id);
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('SESSION_EXPIRED');
        }
        expect((await prisma.shareSession.findUniqueOrThrow({ where: { id } })).status).toBe(
          'EXPIRED',
        );
        expect(
          await prisma.accessLog.count({ where: { sessionId: id, action: 'SHARE_EXPIRED' } }),
        ).toBe(1);
      });

      it('accès arrêté par le patient : 403 SESSION_REVOKED sur chaque route', async () => {
        const id = await opened(ALL);
        expect((await call('DELETE', `/shares/${id}`, token(awa))).status).toBe(204);
        for (const route of routes) {
          const res = await read(route, id);
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('SESSION_REVOKED');
        }
      });

      it('403 pour un médecin qui n’est pas celui de la session ; 404 pour une session inconnue', async () => {
        const id = await opened(ALL);
        for (const route of routes) {
          expect((await read(route, id, '', drB)).status).toBe(403);
          expect((await read(route, randomUUID())).status).toBe(404);
        }
        expect((await read('summary', 'pas-un-uuid')).status).toBe(400);
      });

      it('médecin PENDING refusé ; approbation retirée après le scan : refusé aussi ; patient 403 ; sans jeton 401', async () => {
        const id = await opened(ALL);
        const pending = await read('summary', id, '', drPending);
        expect(pending.status).toBe(403);
        expect(pending.body.code).toBe('DOCTOR_NOT_APPROVED');
        await prisma.doctorProfile.update({
          where: { userId: drA },
          data: { verificationStatus: 'REJECTED' },
        });
        for (const route of routes) {
          const res = await read(route, id);
          expect(res.status).toBe(403);
          expect(res.body.code).toBe('DOCTOR_NOT_APPROVED');
        }
        expect((await call('GET', `/doctor/sessions/${id}/summary`, token(awa))).status).toBe(403);
        expect((await call('GET', `/doctor/sessions/${id}/summary`, null)).status).toBe(401);
      });

      it('arrêt par le patient PENDANT une lecture (session verrouillée) : la lecture est refusée, rien n’est journalisé', async () => {
        const id = await opened(ALL);
        let pending: Promise<{ status: number; body: Record<string, unknown> }> | undefined;
        const started = Date.now();
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 AS l FROM "ShareSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
            pending = read('summary', id); // passe le premier contrôle, puis attend le verrou
            await sleep(600);
            await tx.shareSession.update({
              where: { id },
              data: { status: 'REVOKED', revokedAt: new Date() },
            });
          },
          { timeout: 20_000 },
        );
        const res = await pending!;
        expect(Date.now() - started).toBeGreaterThanOrEqual(500); // elle a bien attendu le verrou
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SESSION_REVOKED');
        expect(await views(id)).toEqual([]);
      });
    });

    // ------------------------------------------------------------------ résumé

    describe('GET /summary', () => {
      it('identité LIMITÉE (ni nom ni date de naissance), seuils personnels, qualité et statistiques ; pas d’observations sans AI_SUMMARY', async () => {
        for (let h = 1; h <= 24; h++) await measure(awa, h * 6, { mgDl: 100 + h });
        const id = await opened(['GLUCOSE_HISTORY']);
        const summary = await ok<DoctorSummary>('summary', id);
        expect(doctorSummarySchema.parse(summary)).toEqual(summary);
        expect(summary.session).toMatchObject({
          id,
          status: 'ACTIVE',
          categories: ['GLUCOSE_HISTORY'],
        });
        expect(summary.session.expiresAt).toBe(
          (await prisma.shareSession.findUniqueOrThrow({ where: { id } })).expiresAt?.toISOString(),
        );
        expect(summary.patient).toEqual({
          firstName: 'Awa',
          diabetesType: 'TYPE_1',
          diagnosisYear: 2015,
          preferredUnit: 'MMOL_L',
          thresholds: { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 240 },
        });
        expect(JSON.stringify(summary)).not.toMatch(/Nomdefamille|1990/);
        expect(summary.quality.daysWithData).toBeGreaterThan(0);
        expect(summary.stats?.count).toBe(24);
        expect(summary.stats?.timeInRangePct).toBe(100);
        expect(summary).not.toHaveProperty('insights');
      });

      it('ni glycémies ni résumé partagés : qualité sur zéro mesure, statistiques nulles (rien n’est révélé)', async () => {
        for (let h = 1; h <= 24; h++) await measure(awa, h * 6);
        const id = await opened(['MEALS']);
        const summary = await ok<DoctorSummary>('summary', id);
        expect(summary.quality).toMatchObject({
          score: expect.any(Number),
          level: 'INSUFFICIENT',
          analyzable: false,
          daysWithData: 0,
          daysInPeriod: 30,
        });
        expect(summary.stats).toBeNull();
        expect(summary).not.toHaveProperty('insights');
      });

      it('résumé des analyses partagé : observations avec leur phrase ; preuves vides si les glycémies ne sont pas partagées', async () => {
        // Hypoglycémies répétées le soir : le moteur produit des observations avec preuves.
        for (let d = 0; d < 12; d++) {
          await measure(awa, d * 24 + 2, { mgDl: 50 });
          await measure(awa, d * 24 + 10, { mgDl: 130 });
        }
        const both = await opened(['GLUCOSE_HISTORY', 'AI_SUMMARY']);
        const withGlucose = await ok<DoctorSummary>('summary', both);
        expect(withGlucose.insights?.length).toBeGreaterThan(0);
        expect(withGlucose.insights?.some((i) => i.evidenceIds.length > 0)).toBe(true);
        for (const insight of withGlucose.insights ?? [])
          expect(insight.text.length).toBeGreaterThan(10);
        expect(withGlucose.stats?.count).toBe(24);

        const only = await opened(['AI_SUMMARY'], awa, drB);
        const res = await read('summary', only, '', drB);
        const summaryOnly = res.body as unknown as DoctorSummary;
        expect(summaryOnly.insights?.length).toBe(withGlucose.insights?.length);
        for (const insight of summaryOnly.insights ?? []) expect(insight.evidenceIds).toEqual([]);
        expect(summaryOnly.stats?.count).toBe(24); // le résumé contient ses chiffres
      });
    });

    // ------------------------------------------------------------------ glycémies

    describe('GET /measurements', () => {
      it('historique non partagé : 403 CATEGORY_NOT_SHARED, rien n’est journalisé', async () => {
        const id = await opened(['MEALS', 'AI_SUMMARY']);
        const res = await read('measurements', id);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CATEGORY_NOT_SHARED');
        expect(await views(id)).toEqual([]);
      });

      it('notes personnelles ABSENTES si non cochées (pas même lues) ; présentes si cochées', async () => {
        await measure(awa, 1, { note: 'note très privée' });
        const without = await opened(['GLUCOSE_HISTORY']);
        const page = await ok<MeasurementListDto>('measurements', without);
        expect(measurementListSchema.parse(page)).toEqual(page);
        expect(page.items[0]?.note).toBeNull();
        expect(JSON.stringify(page)).not.toContain('privée');

        const withNotes = await opened(['GLUCOSE_HISTORY', 'PERSONAL_NOTES'], awa, drB);
        const res = await read('measurements', withNotes, '', drB);
        expect((res.body as unknown as MeasurementListDto).items[0]?.note).toBe('note très privée');
      });

      it('seulement les mesures de CE patient, sans les supprimées ; période [from ; to[ ; pages par curseur', async () => {
        const kept = [];
        for (let h = 1; h <= 5; h++) kept.push((await measure(awa, h)).id);
        await measure(awa, 0.5, { deleted: true });
        await measure(paul, 2);
        const id = await opened(['GLUCOSE_HISTORY']);

        const first = await ok<MeasurementListDto>('measurements', id, '?limit=2');
        const second = await ok<MeasurementListDto>(
          'measurements',
          id,
          `?limit=2&cursor=${first.nextCursor}`,
        );
        const third = await ok<MeasurementListDto>(
          'measurements',
          id,
          `?limit=2&cursor=${second.nextCursor}`,
        );
        expect([...first.items, ...second.items, ...third.items].map((m) => m.id)).toEqual(kept);
        expect(third.nextCursor).toBeNull();
        for (const m of first.items) expect(m.deletedAt).toBeNull();

        const from = new Date(Date.now() - 3.5 * HOUR).toISOString();
        const to = new Date(Date.now() - 1.5 * HOUR).toISOString();
        const ranged = await ok<MeasurementListDto>(
          'measurements',
          id,
          `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        expect(ranged.items.map((m) => m.id)).toEqual(kept.slice(1, 3));
        // `to` est EXCLU : une mesure pile à cette heure n'est pas renvoyée ; `from` est inclus.
        const edge = await prisma.measurement.findUniqueOrThrow({ where: { id: kept[1]! } });
        const exact = encodeURIComponent(edge.measuredAt.toISOString());
        const before = await ok<MeasurementListDto>('measurements', id, `?to=${exact}`);
        expect(before.items.map((m) => m.id)).toEqual(kept.slice(2));
        const after = await ok<MeasurementListDto>('measurements', id, `?from=${exact}`);
        expect(after.items.map((m) => m.id)).toEqual(kept.slice(0, 2));
        expect((await read('measurements', id, '?cursor=abc')).status).toBe(400);
      });
    });

    // ------------------------------------------------------------------ chronologie

    describe('GET /timeline', () => {
      it('seulement les catégories partagées : mesures (état selon les seuils DU patient) et repas ; ni activité ni traitement', async () => {
        await measure(awa, 1, { mgDl: 70 }); // 70 < 80 (seuil personnel) : « en dessous » (défaut : dans la plage)
        await measure(awa, 3, { mgDl: 250 });
        await event(awa, 'MEAL', 'Riz et haricots', 2);
        await event(awa, 'ACTIVITY', 'Marche', 4);
        await event(awa, 'TREATMENT', 'Metformine', 5);
        await event(paul, 'MEAL', 'Repas de Paul', 2);
        const id = await opened(['GLUCOSE_HISTORY', 'MEALS']);
        const page = await ok<TimelineList>('timeline', id);
        expect(timelineListSchema.parse(page)).toEqual(page);
        // Sans « notes personnelles » : aucun texte libre (contrat 0.4.2).
        const none = { details: null, durationMinutes: null, importBatchId: null };
        expect(page.items.map(({ at: _at, ...rest }) => rest)).toEqual([
          {
            kind: 'MEASUREMENT',
            label: 'FASTING',
            valueMgDl: 70,
            state: 'LOW',
            source: 'MANUAL',
            ...none,
          },
          {
            kind: 'MEAL',
            label: 'Riz et haricots',
            valueMgDl: null,
            state: null,
            source: null,
            ...none,
          },
          {
            kind: 'MEASUREMENT',
            label: 'FASTING',
            valueMgDl: 250,
            state: 'VERY_HIGH',
            source: 'MANUAL',
            ...none,
          },
        ]);
        expect(JSON.stringify(page)).not.toMatch(/détail privé|Marche|Metformine|Paul/);
      });

      it('contrat 0.4.2 : durée toujours ; texte libre SEULEMENT avec les notes personnelles ; lot d’une mesure importée', async () => {
        const batch = await prisma.importBatch.create({
          data: {
            patientId: awa,
            fileName: 'export.csv',
            status: 'COMMITTED',
            defaultUnit: 'G_L',
            parsedRows: [],
          },
        });
        const imported = await measure(awa, 1);
        await prisma.measurement.update({
          where: { id: imported.id },
          data: { source: 'IMPORT', importBatchId: batch.id },
        });
        await event(awa, 'ACTIVITY', 'Marche', 2, randomUUID(), 40);
        await event(awa, 'TREATMENT', 'Metformine', 3);

        const categories = ['GLUCOSE_HISTORY', 'ACTIVITY', 'TREATMENTS'];
        const without = await opened(categories);
        const plain = await ok<TimelineList>('timeline', without);
        expect(timelineListSchema.parse(plain)).toEqual(plain);
        expect(
          plain.items.map((i) => [i.kind, i.durationMinutes, i.details, i.importBatchId]),
        ).toEqual([
          ['MEASUREMENT', null, null, batch.id],
          ['ACTIVITY', 40, null, null],
          ['TREATMENT', null, null, null],
        ]);
        expect(JSON.stringify(plain)).not.toContain('détail privé');

        const withNotes = await opened([...categories, 'PERSONAL_NOTES'], awa, drB);
        const res = await read('timeline', withNotes, '', drB);
        const page = res.body as unknown as TimelineList;
        expect(page.items.map((i) => [i.kind, i.details])).toEqual([
          ['MEASUREMENT', null], // la note d'une mesure reste dans GET /measurements
          ['ACTIVITY', 'détail privé'],
          ['TREATMENT', 'détail privé'],
        ]);
        await prisma.measurement.deleteMany({ where: { importBatchId: batch.id } });
        await prisma.importBatch.delete({ where: { id: batch.id } });
      });

      it('sans glycémies : seulement les évènements partagés ; aucune catégorie de la chronologie : 403', async () => {
        await measure(awa, 1);
        await event(awa, 'ACTIVITY', 'Marche', 2);
        await event(awa, 'TREATMENT', 'Insuline lente', 3);
        const id = await opened(['TREATMENTS', 'ACTIVITY']);
        const page = await ok<TimelineList>('timeline', id);
        expect(page.items.map((i) => [i.kind, i.label])).toEqual([
          ['ACTIVITY', 'Marche'],
          ['TREATMENT', 'Insuline lente'],
        ]);
        const none = await opened(['AI_SUMMARY', 'PERSONAL_NOTES'], awa, drB);
        const res = await read('timeline', none, '', drB);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CATEGORY_NOT_SHARED');
      });

      it('pages par curseur À TRAVERS les deux tables, même à la même heure : ni doublon ni oubli', async () => {
        // 4 mesures et 4 évènements à la MÊME heure, plus d'autres avant.
        const same = Date.now() - HOUR;
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          const m = await prisma.measurement.create({
            data: {
              id: randomUUID(),
              patientId: awa,
              valueMgDl: 110,
              originalValue: 1.1,
              originalUnit: 'G_L',
              measuredAt: new Date(same),
              clientUpdatedAt: new Date(),
            },
          });
          ids.push(m.id);
          const e = await prisma.lifeEvent.create({
            data: {
              id: randomUUID(),
              patientId: awa,
              type: 'MEAL',
              label: `Repas ${i}`,
              occurredAt: new Date(same),
              clientUpdatedAt: new Date(),
            },
          });
          ids.push(e.id);
        }
        for (let h = 2; h <= 4; h++) {
          await measure(awa, h);
          await event(awa, 'MEAL', `Plus tôt ${h}`, h + 0.5);
        }
        const id = await opened(['GLUCOSE_HISTORY', 'MEALS']);
        const all = await ok<TimelineList>('timeline', id);
        expect(all.items).toHaveLength(14);
        expect(all.nextCursor).toBeNull();

        const pages: TimelineList['items'] = [];
        let cursor: string | null = null;
        let count = 0;
        do {
          const page: TimelineList = await ok<TimelineList>(
            'timeline',
            id,
            `?limit=3${cursor ? `&cursor=${cursor}` : ''}`,
          );
          expect(page.items.length).toBeLessThanOrEqual(3);
          pages.push(...page.items);
          cursor = page.nextCursor;
          count++;
        } while (cursor && count < 20);
        expect(pages).toEqual(all.items);
        // Ordre : du plus récent au plus ancien.
        const times = pages.map((i) => Date.parse(i.at));
        expect([...times].sort((a, b) => b - a)).toEqual(times);
      });
    });

    // ------------------------------------------------------------------ journal

    describe('journal du patient : une ligne par moment de lecture', () => {
      it('première lecture : une ligne SHARE_VIEWED (médecin, session, IP) ; les lectures des 5 minutes suivantes n’en ajoutent pas', async () => {
        const id = await opened(['GLUCOSE_HISTORY', 'MEALS']);
        expect(await views(id)).toEqual([]);
        await ok('summary', id);
        await ok('measurements', id);
        await ok('timeline', id);
        await ok('summary', id);
        const lines = await views(id);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ patientId: awa, actorId: drA, sessionId: id });
        expect(lines[0]?.ip).toBeTruthy();
      });

      it('10 lectures EN MÊME TEMPS : une seule ligne', async () => {
        const id = await opened(['GLUCOSE_HISTORY', 'MEALS']);
        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            read((['summary', 'measurements', 'timeline'] as const)[i % 3] as Route, id),
          ),
        );
        for (const res of results) expect(res.status).toBe(200);
        expect(await views(id)).toHaveLength(1);
      });

      it('après 5 minutes, une nouvelle lecture laisse une nouvelle ligne', async () => {
        const id = await opened(['GLUCOSE_HISTORY']);
        await ok('summary', id);
        const [line] = await views(id);
        await prisma.accessLog.update({
          where: { id: line!.id },
          data: { at: new Date(Date.now() - VIEW_LOG_WINDOW_MS - 1000) },
        });
        await ok('measurements', id);
        expect(await views(id)).toHaveLength(2);
        await ok('summary', id);
        expect(await views(id)).toHaveLength(2);
      });

      it('lecture refusée (autre médecin, arrêt, catégorie) : aucune ligne', async () => {
        const id = await opened(['MEALS']);
        expect((await read('summary', id, '', drB)).status).toBe(403);
        expect((await read('measurements', id)).status).toBe(403);
        expect(await views(id)).toEqual([]);
        expect((await call('DELETE', `/shares/${id}`, token(awa))).status).toBe(204);
        expect((await read('summary', id)).status).toBe(403);
        expect(await views(id)).toEqual([]);
      });
    });
  },
);
