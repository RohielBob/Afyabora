// Ticket L6-02 : téléchargement du rapport « Préparer ma consultation » (GET /reports/consultation pour le
// patient, GET /doctor/sessions/:id/report pour un médecin autorisé, journalisé), sur une VRAIE base
// PostgreSQL : vrai serveur HTTP, vraies gardes, vrai Prisma, vrai PDF.
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
import { analysisWindow } from '@glyka/analytics';
import type { AccessLogList, CreateShareResponse, ShareCategory } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { DoctorModule } from '../src/modules/doctor/doctor.module';
import { ReportsModule } from '../src/modules/reports/reports.module';
import {
  ReportsService,
  reportFilename,
  withShareCode,
} from '../src/modules/reports/reports.service';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe.skipIf(!isTestDatabase(DB_URL))(
  'L6-02 : téléchargement du rapport PDF (vraie base)',
  () => {
    let prisma: PrismaClient;
    let app: INestApplication;
    let baseUrl: string;
    let reports: ReportsService;
    const jwt = new JwtService({ secret: SECRET });
    const awa = randomUUID();
    const paul = randomUUID();
    const noProfile = randomUUID();
    const drA = randomUUID();
    const drB = randomUUID();
    const drPending = randomUUID();
    const everyone = [awa, paul, noProfile, drA, drB, drPending];
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
      const bytes = Buffer.from(await res.arrayBuffer());
      const isPdf = (res.headers.get('content-type') ?? '').startsWith('application/pdf');
      return {
        status: res.status,
        headers: res.headers,
        bytes,
        body: (isPdf || bytes.length === 0 ? {} : JSON.parse(bytes.toString('utf8'))) as Record<
          string,
          unknown
        >,
      };
    };
    const opened = async (categories: ShareCategory[], doctor = drA) => {
      const qr = (await call('POST', '/shares', token(awa), { categories, duration: 'MIN_30' }))
        .body as unknown as CreateShareResponse;
      expect(
        (await call('POST', '/shares/claim', token(doctor, 'DOCTOR'), { token: qr.token.token }))
          .status,
      ).toBe(200);
      return qr.session.id;
    };
    const download = (id: string, doctor = drA, query = '') =>
      call('GET', `/doctor/sessions/${id}/report${query}`, token(doctor, 'DOCTOR'));
    const lines = (sessionId: string, action: string) =>
      prisma.accessLog.findMany({ where: { sessionId, action }, orderBy: { at: 'asc' } });

    beforeAll(async () => {
      prisma = new PrismaClient({ datasourceUrl: DB_URL });
      const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
        id,
        email: `rep-${id}@afyabora.test`,
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
                diabetesType: 'TYPE_2',
                diagnosisYear: 2019,
                preferredUnit: 'MMOL_L',
                veryLowMgDl: 60,
                targetMinMgDl: 80,
                targetMaxMgDl: 160,
                veryHighMgDl: 240,
                timezoneOffsetMinutes: 120,
              },
            },
          },
        });
      }
      await prisma.user.create({ data: user(noProfile, 'PATIENT') });
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
                firstName: 'Aline',
                lastName: 'Démo',
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
            module: class ReportsInfraModule {},
            global: true,
            providers: [
              { provide: PrismaService, useValue: prisma },
              { provide: ConfigService, useValue: { get: () => undefined } },
            ],
            exports: [PrismaService, ConfigService],
          },
          SharingModule,
          ReportsModule,
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
      reports = moduleRef.get(ReportsService);
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
      vi.restoreAllMocks();
      await prisma.accessLog.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.shareSession.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.measurement.deleteMany({ where: { patientId: { in: patients } } });
      await prisma.doctorProfile.update({
        where: { userId: drA },
        data: { verificationStatus: 'APPROVED' },
      });
    });

    // ------------------------------------------------------------------ patient

    describe('GET /reports/consultation (patient)', () => {
      it('200 : un PDF à télécharger, jamais mis en cache ; 30 jours par défaut', async () => {
        const res = await call('GET', '/reports/consultation', token(awa));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('application/pdf');
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('content-disposition')).toMatch(
          /^attachment; filename="afyabora-rapport-\d{4}-\d{2}-\d{2}-30j\.pdf"$/,
        );
        expect(res.bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(Number(res.headers.get('content-length'))).toBe(res.bytes.length);
      });

      it('période 14 ou 90 : acceptée ; 7, 31 ou texte : 400', async () => {
        const ninety = await call('GET', '/reports/consultation?period=90', token(awa));
        expect(ninety.headers.get('content-disposition')).toContain('-90j.pdf');
        expect((await call('GET', '/reports/consultation?period=14', token(awa))).status).toBe(200);
        for (const bad of ['7', '31', 'abc']) {
          expect(
            (await call('GET', `/reports/consultation?period=${bad}`, token(awa))).status,
          ).toBe(400);
        }
      });

      it('sans connexion : 401 ; médecin : 403 (rôle) ; profil pas créé : 404', async () => {
        expect((await call('GET', '/reports/consultation', null)).status).toBe(401);
        expect((await call('GET', '/reports/consultation', token(drA, 'DOCTOR'))).status).toBe(403);
        const missing = await call('GET', '/reports/consultation', token(noProfile));
        expect(missing.status).toBe(404);
        expect(missing.body.message).toMatch(/^Profil introuvable/);
      });

      it('données lues : SEULEMENT les mesures non supprimées de CE patient, dans la fenêtre ; profil complet', async () => {
        const now = Date.now();
        const make = (patientId: string, ago: number, deleted = false) =>
          prisma.measurement.create({
            data: {
              id: randomUUID(),
              patientId,
              valueMgDl: 130,
              originalValue: 7.2,
              originalUnit: 'MMOL_L',
              measuredAt: new Date(now - ago),
              context: 'AFTER_MEAL',
              clientUpdatedAt: new Date(),
              deletedAt: deleted ? new Date() : null,
            },
          });
        const kept = await make(awa, 2 * HOUR);
        const previous = await make(awa, 40 * DAY); // période précédente : utile à la comparaison
        await make(awa, 3 * HOUR, true); // supprimée
        await make(awa, 80 * DAY); // hors fenêtre (30 + 30 jours)
        await make(paul, 2 * HOUR); // autre patient

        const input = await reports.reportInput(awa, 30, { kind: 'PATIENT' }, now);
        expect(input.measurements.map((m) => m.id).sort()).toEqual([kept.id, previous.id].sort());
        const window = analysisWindow(30, now, 120);
        for (const m of input.measurements) {
          expect(m.at).toBeGreaterThanOrEqual(window.from);
          expect(m.at).toBeLessThan(window.to);
        }
        expect(input.patient).toEqual({
          firstName: 'Awa',
          lastName: 'Mbuyi',
          diabetesType: 'TYPE_2',
          diagnosisYear: 2019,
          preferredUnit: 'MMOL_L',
          thresholds: { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 240 },
          timezoneOffsetMinutes: 120,
        });
        expect(input).toMatchObject({ days: 30, now, author: { kind: 'PATIENT' } });
      });

      it('nom du fichier : date À L’HEURE DU PATIENT et période, jamais son nom', () => {
        // 19 oct. 2026 à 23:30 UTC = 20 oct. à 01:30 à UTC+2.
        expect(reportFilename(Date.UTC(2026, 9, 19, 23, 30), 30, 120)).toBe(
          'afyabora-rapport-2026-10-20-30j.pdf',
        );
      });

      it('nom du rapport du médecin : code court du partage avant « .pdf »', () => {
        expect(
          withShareCode(
            'afyabora-rapport-2026-10-20-30j.pdf',
            '7ea97249-f951-4671-add5-710f4c6df047',
          ),
        ).toBe('afyabora-rapport-2026-10-20-30j-7EA972.pdf');
      });
    });

    // ------------------------------------------------------------------ médecin

    describe('GET /doctor/sessions/:id/report (médecin)', () => {
      it('« Rapport PDF » partagé : le PDF, et une ligne REPORT_DOWNLOADED À CHAQUE téléchargement', async () => {
        const id = await opened(['REPORT_DOWNLOAD']);
        const first = await download(id);
        expect(first.status).toBe(200);
        expect(first.headers.get('content-type')).toBe('application/pdf');
        expect(first.headers.get('cache-control')).toBe('no-store');
        expect(first.bytes.subarray(0, 5).toString()).toBe('%PDF-');
        // Code court du partage dans le nom (L6-04), jamais le nom du patient.
        const code = id.replace(/-/g, '').slice(0, 6).toUpperCase();
        expect(first.headers.get('content-disposition')).toMatch(
          new RegExp(
            `^attachment; filename="afyabora-rapport-\\d{4}-\\d{2}-\\d{2}-30j-${code}\\.pdf"$`,
          ),
        );
        expect((await download(id, drA, '?period=90')).status).toBe(200);
        const downloads = await lines(id, 'REPORT_DOWNLOADED');
        expect(downloads).toHaveLength(2); // jamais regroupées, contrairement aux consultations
        expect(downloads[0]).toMatchObject({ patientId: awa, actorId: drA, sessionId: id });
        expect(downloads[0]?.ip).toBeTruthy();
        expect(await lines(id, 'SHARE_VIEWED')).toEqual([]);
      });

      it('le rapport est celui DU PATIENT de la session, signé du médecin qui le télécharge', async () => {
        const spy = vi.spyOn(reports, 'consultation');
        const id = await opened(['REPORT_DOWNLOAD']);
        expect((await download(id, drA, '?period=14')).status).toBe(200);
        expect(spy).toHaveBeenCalledWith(awa, 14, { kind: 'DOCTOR', name: 'Aline Démo' });
      });

      it('« Rapport PDF » non coché : 403 CATEGORY_NOT_SHARED, rien n’est généré ni journalisé', async () => {
        const spy = vi.spyOn(reports, 'consultation');
        const id = await opened(['GLUCOSE_HISTORY', 'MEALS', 'AI_SUMMARY']);
        const res = await download(id);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CATEGORY_NOT_SHARED');
        expect(spy).not.toHaveBeenCalled();
        expect(await lines(id, 'REPORT_DOWNLOADED')).toEqual([]);
      });

      it('accès échu ou arrêté, autre médecin, médecin non approuvé, inconnu, patient : refusé, rien journalisé', async () => {
        const expired = await opened(['REPORT_DOWNLOAD']);
        await prisma.shareSession.update({
          where: { id: expired },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        expect((await download(expired)).body.code).toBe('SESSION_EXPIRED');

        const revoked = await opened(['REPORT_DOWNLOAD']);
        expect((await call('DELETE', `/shares/${revoked}`, token(awa))).status).toBe(204);
        expect((await download(revoked)).body.code).toBe('SESSION_REVOKED');

        const open = await opened(['REPORT_DOWNLOAD']);
        expect((await download(open, drB)).status).toBe(403);
        expect((await download(open, drPending)).body.code).toBe('DOCTOR_NOT_APPROVED');
        expect((await download(randomUUID())).status).toBe(404);
        expect((await call('GET', `/doctor/sessions/${open}/report`, token(awa))).status).toBe(403);
        expect((await download(open, drA, '?period=7')).status).toBe(400);
        for (const id of [expired, revoked, open]) {
          expect(await lines(id, 'REPORT_DOWNLOADED')).toEqual([]);
        }
      });

      it('le patient voit le téléchargement dans son journal (« Rapport téléchargé »), sans adresse IP', async () => {
        const id = await opened(['REPORT_DOWNLOAD']);
        expect((await download(id)).status).toBe(200);
        const log = await call('GET', '/shares/log', token(awa));
        const items = (log.body as unknown as AccessLogList).items;
        expect(items.map((i) => i.action)).toEqual(['REPORT_DOWNLOADED', 'SHARE_CLAIMED']);
        expect(items[0]).toMatchObject({ sessionId: id, actorName: 'Aline Démo' });
        expect(JSON.stringify(log.body)).not.toMatch(/127\.0\.0\.1|"ip"/);
      });
    });
  },
);
