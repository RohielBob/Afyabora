// Ticket L5-05 : GET /shares/log (« Qui a consulté mes données »), sur une VRAIE base PostgreSQL : vrai serveur
// HTTP, vraies gardes, vrai Prisma. Le journal est rempli par le vrai parcours (création, scan, révocation,
// expiration), pas à la main, sauf pour la pagination et les cas rares (urgence, compte supprimé).
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
import { accessLogListSchema, type AccessLogList, type CreateShareResponse } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ClaimFailureLimiter } from '../src/modules/sharing/claim-limiter';
import { ShareExpiryJob } from '../src/modules/sharing/share-expiry';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';

describe.skipIf(!isTestDatabase(DB_URL))('L5-05 : GET /shares/log (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let baseUrl: string;
  let job: ShareExpiryJob;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const drAline = randomUUID();
  const drBruno = randomUUID();
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
  const log = async (query = '', who = token(awa)) => {
    const res = await call('GET', `/shares/log${query}`, who);
    expect(res.status).toBe(200);
    return res.body as unknown as AccessLogList;
  };
  /** Session créée par le patient puis scannée par le médecin (vraies routes). */
  const opened = async (patient = awa, doctor = drAline) => {
    const qr = (
      await call('POST', '/shares', token(patient), {
        categories: ['GLUCOSE_HISTORY'],
        duration: 'MIN_30',
      })
    ).body as unknown as CreateShareResponse;
    const claim = await call('POST', '/shares/claim', token(doctor, 'DOCTOR'), {
      token: qr.token.token,
    });
    expect(claim.status).toBe(200);
    return qr.session.id;
  };
  /** `n` lignes écrites directement, toutes à la même milliseconde (pire cas pour la pagination). */
  const burst = (n: number, at: Date, patientId = awa) =>
    prisma.accessLog.createMany({
      data: Array.from({ length: n }, () => ({
        patientId,
        action: 'SHARE_VIEWED',
        actorId: drAline,
        at,
      })),
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `log-${id}@afyabora.test`,
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
    for (const [id, firstName, lastName] of [
      [drAline, 'Aline', 'Demo'],
      [drBruno, 'Bruno', 'Exemple'],
    ] as const) {
      await prisma.user.create({
        data: {
          ...user(id, 'DOCTOR'),
          doctorProfile: {
            create: {
              firstName,
              lastName,
              licenseNumber: `TEST-${lastName}`,
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
    job = app.get(ShareExpiryJob);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma?.user.deleteMany({ where: { id: { in: [awa, paul, drAline, drBruno] } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.accessLog.deleteMany({ where: { patientId: { in: [awa, paul] } } });
    await prisma.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
  });

  it('journal vide : aucune ligne, pas de page suivante', async () => {
    expect(await log()).toEqual({ items: [], nextCursor: null });
  });

  it('le vrai parcours (scan, révocation, expiration) : chaque étape a sa ligne, de la plus récente à la plus ancienne', async () => {
    const first = await opened(awa, drAline);
    await call('DELETE', `/shares/${first}`, token(awa));
    const second = await opened(awa, drBruno);
    await prisma.shareSession.update({
      where: { id: second },
      data: { expiresAt: new Date(Date.now() + 50) },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await job.run();
    const page = await log();
    expect(accessLogListSchema.parse(page)).toEqual(page);
    expect(page.items.map((i) => [i.action, i.actorName, i.sessionId])).toEqual([
      ['SHARE_EXPIRED', 'Bruno Exemple', second],
      ['SHARE_CLAIMED', 'Bruno Exemple', second],
      ['SHARE_REVOKED', 'Aline Demo', first],
      ['SHARE_CLAIMED', 'Aline Demo', first],
    ]);
    const times = page.items.map((i) => Date.parse(i.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(page.nextCursor).toBeNull();
  });

  it('jamais l’adresse IP ni l’identifiant du médecin : seulement 5 champs par ligne', async () => {
    await opened();
    const stored = await prisma.accessLog.findFirstOrThrow({ where: { patientId: awa } });
    expect(stored.ip).toBeTruthy(); // l'IP est bien gardée en base (enquête en cas d'abus)…
    const [item] = (await log()).items;
    expect(Object.keys(item ?? {}).sort()).toEqual([
      'action',
      'actorName',
      'at',
      'id',
      'sessionId',
    ]);
    const raw = JSON.stringify(await log());
    expect(raw).not.toContain(stored.ip as string); // … mais jamais renvoyée
    expect(raw).not.toContain(drAline);
  });

  it('seulement SON journal : les lignes d’un autre patient n’apparaissent jamais', async () => {
    await opened(paul, drBruno);
    await opened(awa, drAline);
    const mine = await log();
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.actorName).toBe('Aline Demo');
    expect((await log('', token(paul))).items[0]?.actorName).toBe('Bruno Exemple');
  });

  it('accès d’urgence anonyme et compte médecin supprimé : ligne gardée, sans nom', async () => {
    const gone = randomUUID();
    await prisma.accessLog.createMany({
      data: [
        { patientId: awa, action: 'EMERGENCY_VIEWED', at: new Date(Date.now() - 2000) },
        { patientId: awa, action: 'SHARE_VIEWED', actorId: gone, at: new Date(Date.now() - 1000) },
      ],
    });
    expect((await log()).items.map((i) => [i.action, i.actorName, i.sessionId])).toEqual([
      ['SHARE_VIEWED', null, null],
      ['EMERGENCY_VIEWED', null, null],
    ]);
  });

  it('pages : 25 lignes à la MÊME milliseconde, par 10 ⇒ 3 pages, aucune répétée ni oubliée', async () => {
    await burst(25, new Date('2026-10-18T08:00:00.000Z'));
    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const page: AccessLogList = await log(
        `?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      sizes.push(page.items.length);
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([10, 10, 5]);
    expect(new Set(seen).size).toBe(25);
    expect([...seen].sort().reverse()).toEqual(seen); // même instant : ordre par identifiant
  });

  it('page exactement pleine : pas de page suivante vide', async () => {
    await burst(10, new Date());
    expect((await log('?limit=10')).nextCursor).toBeNull();
    expect((await log('?limit=9')).nextCursor).not.toBeNull();
  });

  it('500 lignes par défaut', async () => {
    await burst(501, new Date());
    const page = await log();
    expect(page.items).toHaveLength(500);
    expect(page.nextCursor).not.toBeNull();
  });

  it.each([
    ['?limit=0', 'limit'],
    ['?limit=2001', 'limit'],
    ['?limit=abc', 'limit'],
    ['?cursor=pas-un-curseur', 'cursor'],
    [`?cursor=${'x'.repeat(501)}`, 'cursor'],
  ])('paramètres invalides %s : 400 sur « %s »', async (query, path) => {
    const res = await call('GET', `/shares/log${query}`, token(awa));
    expect(res.status).toBe(400);
    expect((res.body.issues as { path: string }[]).map((i) => i.path)).toContain(path);
  });

  it('médecin : 403 (le journal est celui du patient) ; sans connexion : 401', async () => {
    expect((await call('GET', '/shares/log', token(drAline, 'DOCTOR'))).status).toBe(403);
    expect((await call('GET', '/shares/log', null)).status).toBe(401);
  });

  it('personne ne peut modifier ni supprimer le journal : aucune route d’écriture', async () => {
    await opened();
    // DELETE /shares/log tombe sur DELETE /shares/:id : « log » n'est pas un identifiant ⇒ 400.
    const expected: Record<string, number> = { DELETE: 400, PUT: 404, PATCH: 404, POST: 404 };
    for (const [method, status] of Object.entries(expected)) {
      expect((await call(method, '/shares/log', token(awa))).status).toBe(status);
    }
    expect((await log()).items).toHaveLength(1);
  });
});
