// Ticket L5-14 : tests de SÉCURITÉ du partage par QR (ADR-0003, docs/security/checklist.md), sur une VRAIE
// base PostgreSQL, par les vraies routes HTTP, en se mettant à la place d'un attaquant :
//  - double scan, jeton de plus de 60 s, jeton remplacé, scans simultanés ;
//  - après expiration et après arrêt : 403 sur TOUTES les routes médecin du contrat (la liste vient du
//    contrat : une route ajoutée plus tard est contrôlée automatiquement) ;
//  - catégorie décochée : des MARQUEURS uniques sont semés dans chaque catégorie, et aucun ne doit sortir
//    par aucune route quand sa catégorie n'est pas partagée (notes personnelles comprises) ;
//  - seul le hash du jeton est en base (toutes les tables sont fouillées) ;
//  - limitation de débit de /shares/claim (scans ratés et nombre de requêtes) ;
//  - chaque étape écrite dans le journal, tel que le patient le lit ;
//  - rôle et propriété (un patient ne touche pas au partage d'un autre ; un médecin ne révoque pas).
// Beaucoup de ces règles sont aussi testées module par module (L5-01 à L5-12) ; ce fichier les rejoue
// ENSEMBLE, de bout en bout, pour la checklist de sécurité. Ne tourne que sur une base « …_test ».
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import type { AccessLogList, CreateShareResponse, ShareCategory } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { DoctorModule } from '../src/modules/doctor/doctor.module';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { hashShareToken } from '../src/modules/sharing/share-token';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const KEY = randomBytes(32).toString('base64');
const HOUR = 3_600_000;

/** Routes médecin d'UNE session, lues dans le contrat (`/doctor/sessions/{sessionId}/…`, GET). */
const contract = JSON.parse(
  readFileSync(resolve(__dirname, '../../../docs/api/openapi.v0.json'), 'utf-8'),
) as { paths: Record<string, { get?: { 'x-roles'?: string[] } }> };
const DOCTOR_SESSION_ROUTES = Object.entries(contract.paths)
  .filter(([path, item]) => path.startsWith('/doctor/sessions/{sessionId}/') && item.get)
  .map(([path]) => path.replace('/doctor/sessions/{sessionId}/', ''));

/**
 * Routes du contrat pas encore codées (le ticket qui les apporte est contrôlé automatiquement ici). Vide
 * depuis L6-02 : `/report` (rapport PDF) est contrôlé comme les autres.
 */
const NOT_YET_CODED: string[] = [];

/** Marqueurs semés dans chaque catégorie : s'ils sortent alors que la catégorie est décochée, c'est une fuite. */
const MARK = {
  MEALS: 'MARQUEUR-REPAS-7Q',
  ACTIVITY: 'MARQUEUR-ACTIVITE-7Q',
  TREATMENTS: 'MARQUEUR-TRAITEMENT-7Q',
  NOTE: 'MARQUEUR-NOTE-MESURE-7Q',
  DETAIL: 'MARQUEUR-DETAIL-EVENEMENT-7Q',
};
const ALL: ShareCategory[] = [
  'GLUCOSE_HISTORY',
  'TREATMENTS',
  'MEALS',
  'ACTIVITY',
  'AI_SUMMARY',
  'PERSONAL_NOTES',
  'REPORT_DOWNLOAD',
];

describe.skipIf(!isTestDatabase(DB_URL))('L5-14 : sécurité du partage par QR (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let limited: INestApplication;
  let baseUrl: string;
  let limitedUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const drA = randomUUID();
  const drB = randomUUID();
  const crowd = Array.from({ length: 10 }, () => randomUUID());
  const everyone = [awa, paul, drA, drB, ...crowd];
  const patients = [awa, paul];
  let glucoseId = '';
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });
  const doc = (id: string) => token(id, 'DOCTOR');

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
    // Le rapport (L6-02) est un PDF, pas du JSON : son texte reste fouillé par les marqueurs.
    const json = !(res.headers.get('content-type') ?? '').startsWith('application/pdf');
    return {
      status: res.status,
      text,
      headers: res.headers,
      body: (json && text ? JSON.parse(text) : {}) as Record<string, unknown>,
    };
  };
  const share = async (categories: ShareCategory[], patient = awa, url = baseUrl) =>
    (await call('POST', '/shares', token(patient), { categories, duration: 'HOUR_1' }, url))
      .body as unknown as CreateShareResponse;
  const claim = (qrToken: string, doctor = drA, url = baseUrl) =>
    call('POST', '/shares/claim', doc(doctor), { token: qrToken }, url);
  /** Partage créé PUIS scanné par le médecin (accès ouvert). */
  const opened = async (categories: ShareCategory[], doctor = drA) => {
    const qr = await share(categories);
    expect((await claim(qr.token.token, doctor)).status).toBe(200);
    return qr.session.id;
  };
  const read = (route: string, id: string, doctor = drA) =>
    call('GET', `/doctor/sessions/${id}/${route}`, doc(doctor));
  const routeExists = (res: { status: number; body: Record<string, unknown> }) =>
    !(res.status === 404 && String(res.body.message ?? '').startsWith('Cannot GET'));

  const build = async (withLimits: boolean) => {
    const config = (key: string) => (key === 'FIELD_ENCRYPTION_KEY' ? KEY : undefined);
    let builder = Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
        {
          module: class SecurityInfraModule {},
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
        // Serveur « limité » : vraies limites (débit par route + blocage après des scans ratés).
        ...(withLimits ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }] : []),
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    });
    // Serveur principal : sans blocage, pour que les scans ratés VOULUS d'un test ne bloquent pas le suivant.
    if (!withLimits) {
      builder = builder
        .overrideProvider(ClaimFailureLimiter)
        .useValue({ begin: () => () => undefined });
    }
    const instance = (await builder.compile()).createNestApplication();
    instance.useGlobalFilters(new AllExceptionsFilter());
    await instance.listen(0, '127.0.0.1');
    return {
      instance,
      url: `http://127.0.0.1:${(instance.getHttpServer().address() as AddressInfo).port}`,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `secu-${id}@afyabora.test`,
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
            },
          },
        },
      });
    }
    for (const id of [drA, drB, ...crowd]) {
      await prisma.user.create({
        data: {
          ...user(id, 'DOCTOR'),
          doctorProfile: {
            create: {
              firstName: 'Docteur',
              lastName: 'Test',
              licenseNumber: 'TEST-1',
              institution: 'Clinique de test',
              verificationStatus: 'APPROVED',
            },
          },
        },
      });
    }
    // Données d'Awa : 12 mesures (dont une avec note), un repas, une activité, un traitement, chacun
    // avec un marqueur ; le texte libre des évènements porte aussi un marqueur (notes personnelles).
    for (let h = 1; h <= 12; h++) {
      const m = await prisma.measurement.create({
        data: {
          id: randomUUID(),
          patientId: awa,
          valueMgDl: h % 4 === 0 ? 52 : 140 + h,
          originalValue: 1.4,
          originalUnit: 'G_L',
          measuredAt: new Date(Date.now() - h * 6 * HOUR),
          noteEncrypted: h === 1 ? encryptField(MARK.NOTE, KEY) : null,
          clientUpdatedAt: new Date(),
        },
      });
      if (h === 1) glucoseId = m.id;
    }
    for (const [type, label] of [
      ['MEAL', MARK.MEALS],
      ['ACTIVITY', MARK.ACTIVITY],
      ['TREATMENT', MARK.TREATMENTS],
    ] as const) {
      await prisma.lifeEvent.create({
        data: {
          id: randomUUID(),
          patientId: awa,
          type,
          label,
          occurredAt: new Date(Date.now() - 2 * HOUR),
          detailsEncrypted: encryptField(MARK.DETAIL, KEY),
          durationMinutes: type === 'ACTIVITY' ? 30 : null,
          clientUpdatedAt: new Date(),
        },
      });
    }
    ({ instance: app, url: baseUrl } = await build(false));
    ({ instance: limited, url: limitedUrl } = await build(true));
  });

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await prisma?.accessLog.deleteMany({ where: { patientId: { in: patients } } });
    await prisma?.shareSession.deleteMany({ where: { patientId: { in: patients } } });
    await prisma?.user.deleteMany({ where: { id: { in: everyone } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: { in: patients } } });
    await prisma.shareSession.deleteMany({ where: { patientId: { in: patients } } });
  });

  it('le contrat liste bien les routes médecin du dossier ; seules celles d’un ticket à venir manquent', async () => {
    expect(DOCTOR_SESSION_ROUTES.sort()).toEqual(['measurements', 'report', 'summary', 'timeline']);
    const id = await opened(ALL);
    const missing: string[] = [];
    for (const route of DOCTOR_SESSION_ROUTES) {
      if (!routeExists(await read(route, id))) missing.push(route);
    }
    expect(missing.every((route) => NOT_YET_CODED.includes(route))).toBe(true);
  });

  // ------------------------------------------------------------------ le QR

  describe('le QR : usage unique, 60 s, un seul gagnant', () => {
    it('le même QR scanné deux fois : le second est refusé (404 TOKEN_INVALID), même par le même médecin', async () => {
      const qr = await share(['MEALS']);
      expect((await claim(qr.token.token, drA)).status).toBe(200);
      for (const doctor of [drB, drA]) {
        const again = await claim(qr.token.token, doctor);
        expect(again.status).toBe(404);
        expect(again.body.code).toBe('TOKEN_INVALID');
      }
      const row = await prisma.shareSession.findUniqueOrThrow({ where: { id: qr.session.id } });
      expect(row.claimedByDoctorId).toBe(drA);
    });

    it('un jeton de plus de 60 s est refusé, et la session reste en attente', async () => {
      const qr = await share(['MEALS']);
      await prisma.shareToken.updateMany({
        where: { sessionId: qr.session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const late = await claim(qr.token.token);
      expect(late.status).toBe(404);
      expect(late.body.code).toBe('TOKEN_INVALID');
      expect(
        (await prisma.shareSession.findUniqueOrThrow({ where: { id: qr.session.id } })).status,
      ).toBe('PENDING');
    });

    it('un jeton remplacé par une rotation est refusé (photo du QR prise avant la rotation)', async () => {
      const qr = await share(['MEALS']);
      const rotated = await call('GET', `/shares/${qr.session.id}/token`, token(awa));
      expect(rotated.status).toBe(200);
      expect((await claim(qr.token.token)).status).toBe(404);
      expect((await claim(String((rotated.body as { token: string }).token))).status).toBe(200);
    });

    it('10 médecins scannent EN MÊME TEMPS : un seul réussit, une seule ligne SHARE_CLAIMED', async () => {
      const qr = await share(['MEALS']);
      const results = await Promise.all(crowd.map((doctor) => claim(qr.token.token, doctor)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 404)).toHaveLength(9);
      expect(
        await prisma.accessLog.count({
          where: { sessionId: qr.session.id, action: 'SHARE_CLAIMED' },
        }),
      ).toBe(1);
    });
  });

  // ------------------------------------------------------------------ fin d'accès

  describe('fin d’accès : 403 sur TOUTES les routes médecin du contrat', () => {
    const coded = DOCTOR_SESSION_ROUTES.filter((route) => !NOT_YET_CODED.includes(route));

    it('après expiration (page restée ouverte) : 403 SESSION_EXPIRED partout, aucune donnée', async () => {
      const id = await opened(ALL);
      for (const route of coded) expect((await read(route, id)).status).toBe(200);
      await prisma.shareSession.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      for (const route of coded) {
        const res = await read(route, id);
        expect(res.status, route).toBe(403);
        expect(res.body.code, route).toBe('SESSION_EXPIRED');
        expect(res.text).not.toMatch(/MARQUEUR|valueMgDl|Awa/);
      }
      expect((await read('', id)).status).toBe(404); // pas de route « racine » qui contournerait le contrôle
    });

    it('après arrêt par le patient : accès coupé IMMÉDIATEMENT (bien moins de 5 s) sur toutes les routes', async () => {
      const id = await opened(ALL);
      const revoked = await call('DELETE', `/shares/${id}`, token(awa));
      expect(revoked.status).toBe(204);
      const started = Date.now();
      for (const route of coded) {
        const res = await read(route, id);
        expect(res.status, route).toBe(403);
        expect(res.body.code, route).toBe('SESSION_REVOKED');
      }
      expect(Date.now() - started).toBeLessThan(5000);
    });

    it('un autre médecin, même approuvé, est refusé sur toutes les routes ; une session inconnue : 404', async () => {
      const id = await opened(ALL);
      for (const route of coded) {
        expect((await read(route, id, drB)).status, route).toBe(403);
        expect((await read(route, randomUUID())).status, route).toBe(404);
      }
    });
  });

  // ------------------------------------------------------------------ catégories

  describe('une catégorie décochée n’est JAMAIS renvoyée, par aucune route (notes personnelles comprises)', () => {
    /** Tout ce qu'un médecin peut lire de la session, routes du contrat comprises. */
    const everything = async (id: string) => {
      const bodies: Record<string, unknown>[] = [];
      let text = '';
      for (const route of DOCTOR_SESSION_ROUTES) {
        const res = await read(route, id);
        if (res.status === 200) {
          bodies.push(res.body);
          text += res.text;
        }
      }
      return { bodies, text };
    };
    /** Une preuve d'observation (identifiants de mesures) quelque part dans la réponse ? */
    const hasEvidence = (bodies: Record<string, unknown>[]) =>
      bodies.some((body) =>
        ((body.insights as { evidenceIds: string[] }[] | undefined) ?? []).some(
          (insight) => insight.evidenceIds.length > 0,
        ),
      );
    /** Une valeur de glycémie non nulle quelque part dans la réponse ? */
    const hasGlucoseValue = (node: unknown): boolean =>
      Array.isArray(node)
        ? node.some(hasGlucoseValue)
        : !!node &&
          typeof node === 'object' &&
          Object.entries(node).some(
            ([key, value]) => (key === 'valueMgDl' && value !== null) || hasGlucoseValue(value),
          );

    const cases: [
      ShareCategory,
      (seen: { bodies: Record<string, unknown>[]; text: string }) => void,
    ][] = [
      [
        'GLUCOSE_HISTORY',
        ({ bodies, text }) => {
          expect(hasGlucoseValue(bodies)).toBe(false);
          expect(hasEvidence(bodies)).toBe(false); // l'analyse reste lisible, mais sans ses preuves
          expect(text).not.toContain(glucoseId);
          expect(text).not.toContain(MARK.NOTE);
        },
      ],
      ['MEALS', ({ text }) => expect(text).not.toContain(MARK.MEALS)],
      ['ACTIVITY', ({ text }) => expect(text).not.toContain(MARK.ACTIVITY)],
      ['TREATMENTS', ({ text }) => expect(text).not.toContain(MARK.TREATMENTS)],
      [
        'PERSONAL_NOTES',
        ({ text }) => {
          expect(text).not.toContain(MARK.NOTE);
          expect(text).not.toContain(MARK.DETAIL);
        },
      ],
      ['AI_SUMMARY', ({ bodies }) => expect(bodies.some((body) => 'insights' in body)).toBe(false)],
    ];

    it.each(cases)('%s décochée (tout le reste coché)', async (category, absent) => {
      const id = await opened(ALL.filter((c) => c !== category));
      const seen = await everything(id);
      absent(seen);
      // Contrôle du test lui-même : les AUTRES catégories, elles, sont bien lues.
      if (category !== 'MEALS') expect(seen.text).toContain(MARK.MEALS);
      if (category !== 'TREATMENTS') expect(seen.text).toContain(MARK.TREATMENTS);
      if (category !== 'GLUCOSE_HISTORY') expect(hasGlucoseValue(seen.bodies)).toBe(true);
      if (category !== 'GLUCOSE_HISTORY' && category !== 'PERSONAL_NOTES') {
        expect(seen.text).toContain(MARK.NOTE);
      }
      if (category !== 'AI_SUMMARY') {
        expect(seen.bodies.some((body) => 'insights' in body)).toBe(true);
        // Valeurs basses répétées dans les données : l'analyse cite ses preuves quand tout est partagé.
        if (category !== 'GLUCOSE_HISTORY') expect(hasEvidence(seen.bodies)).toBe(true);
      }
    });

    it('une seule catégorie cochée (repas) : rien d’autre ne sort', async () => {
      const id = await opened(['MEALS']);
      const seen = await everything(id);
      expect(seen.text).toContain(MARK.MEALS);
      for (const mark of [MARK.ACTIVITY, MARK.TREATMENTS, MARK.NOTE, MARK.DETAIL, glucoseId]) {
        expect(seen.text).not.toContain(mark);
      }
      expect(hasGlucoseValue(seen.bodies)).toBe(false);
      expect((await read('measurements', id)).body.code).toBe('CATEGORY_NOT_SHARED');
    });
  });

  // ------------------------------------------------------------------ jeton en base

  it('seul le HASH du jeton est en base : le jeton n’apparaît dans AUCUNE table', async () => {
    const qr = await share(['MEALS']);
    const rotated = await call('GET', `/shares/${qr.session.id}/token`, token(awa));
    const tokens = [qr.token.token, String((rotated.body as { token: string }).token)];
    expect((await claim(tokens[1]!)).status).toBe(200);
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ row: string }[]>(
        `SELECT row_to_json(t)::text AS row FROM "${table_name.replace(/"/g, '')}" t`,
      );
      for (const { row } of rows) {
        for (const raw of tokens) expect(row.includes(raw), table_name).toBe(false);
      }
    }
    const stored = await prisma.shareToken.findMany({ where: { sessionId: qr.session.id } });
    expect(stored.map((t) => t.tokenHash).sort()).toEqual(tokens.map(hashShareToken).sort());
  });

  // ------------------------------------------------------------------ débit

  describe('limitation de débit sur /shares/claim (serveur avec les vraies limites)', () => {
    it('5 scans ratés : le 6e est bloqué (429 + Retry-After), même avec un bon QR, qui reste utilisable', async () => {
      const qr = await share(['MEALS'], awa, limitedUrl);
      const attacker = crowd[0]!;
      for (let i = 0; i < 5; i++) {
        expect(
          (await claim(randomBytes(32).toString('base64url'), attacker, limitedUrl)).status,
        ).toBe(404);
      }
      const blocked = await claim(qr.token.token, attacker, limitedUrl);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(
        (await prisma.shareSession.findUniqueOrThrow({ where: { id: qr.session.id } })).status,
      ).toBe('PENDING');
    });

    it('plus de 20 requêtes de scan en une minute depuis la même adresse : 429', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        // Corps invalide : refusé (400) sans compter comme scan raté ; seul le débit est en jeu.
        statuses.push(
          (await call('POST', '/shares/claim', doc(crowd[1]!), { token: 'x' }, limitedUrl)).status,
        );
      }
      // Le test précédent a déjà fait des scans depuis la même adresse dans la minute : on vérifie que le
      // blocage arrive, et qu'au plus 20 requêtes passent (jamais plus que la limite).
      const first429 = statuses.indexOf(429);
      expect(first429).toBeGreaterThan(0);
      expect(statuses.slice(0, first429).every((s) => s === 400)).toBe(true);
      expect(statuses.slice(first429).every((s) => s === 429)).toBe(true);
      expect(statuses.filter((s) => s !== 429).length).toBeLessThanOrEqual(20);
    });
  });

  // ------------------------------------------------------------------ journal

  it('chaque étape est dans le journal du patient (scan, consultation, arrêt, expiration), sans IP ni jeton', async () => {
    const first = await opened(['MEALS']);
    expect((await read('timeline', first)).status).toBe(200);
    expect((await read('timeline', first, drB)).status).toBe(403); // refusé : rien n'est écrit
    expect((await call('DELETE', `/shares/${first}`, token(awa))).status).toBe(204);
    const second = await opened(['MEALS'], drB);
    // Fin de l'accès avancée à dans 1,2 s (après le scan, comme en vrai), puis on attend qu'elle passe.
    await prisma.shareSession.update({
      where: { id: second },
      data: { expiresAt: new Date(Date.now() + 1200) },
    });
    await new Promise((done) => setTimeout(done, 1500));
    expect((await read('timeline', second, drB)).status).toBe(403); // l'échéance est constatée ici

    const log = await call('GET', '/shares/log', token(awa));
    expect(log.status).toBe(200);
    const items = (log.body as unknown as AccessLogList).items;
    const steps = (sessionId: string) =>
      items
        .filter((i) => i.sessionId === sessionId)
        .map((i) => i.action)
        .reverse();
    expect(steps(first)).toEqual(['SHARE_CLAIMED', 'SHARE_VIEWED', 'SHARE_REVOKED']);
    expect(steps(second)).toEqual(['SHARE_CLAIMED', 'SHARE_EXPIRED']);
    expect(items.every((i) => i.actorName === 'Docteur Test')).toBe(true);
    expect(log.text).not.toMatch(/127\.0\.0\.1|::1|"ip"/);
    // Le journal d'Awa ne contient rien de Paul, et Paul ne voit pas celui d'Awa.
    const paulLog = await call('GET', '/shares/log', token(paul));
    expect((paulLog.body as unknown as AccessLogList).items).toEqual([]);
  });

  // ------------------------------------------------------------------ rôle et propriété

  it('rôle et propriété : un patient ne touche pas au partage d’un autre ; un médecin ne crée ni n’arrête un partage', async () => {
    const id = await opened(['MEALS']);
    expect((await call('DELETE', `/shares/${id}`, token(paul))).status).toBe(404);
    expect((await call('GET', `/shares/${id}/status`, token(paul))).status).toBe(404);
    expect((await call('GET', `/shares/${id}/token`, token(paul))).status).toBe(404);
    expect((await call('DELETE', `/shares/${id}`, doc(drA))).status).toBe(403);
    expect(
      (await call('POST', '/shares', doc(drA), { categories: ['MEALS'], duration: 'MIN_5' }))
        .status,
    ).toBe(403);
    expect((await call('GET', `/doctor/sessions/${id}/summary`, token(awa))).status).toBe(403);
    expect((await call('GET', `/doctor/sessions/${id}/summary`, null)).status).toBe(401);
    expect((await prisma.shareSession.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
  });
});
