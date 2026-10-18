// Ticket L5-02 : rotation du QR (GET /shares/:id/token) et consommation à usage unique (consume-token.ts),
// sur une VRAIE base PostgreSQL : vrai serveur HTTP, vraies gardes JWT et rôles, vrai Prisma. L'usage unique
// et les scans simultanés reposent sur les verrous de la base : seule une vraie base peut le prouver.
// Ne tourne que sur une base « …_test » (test/support/test-database.ts).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { shareTokenSchema, type CreateShareResponse, type ShareTokenDto } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { consumeShareToken } from '../src/modules/sharing/consume-token';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe.skipIf(!isTestDatabase(DB_URL))('L5-02 : rotation et usage unique (vraie base)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let limited: INestApplication;
  let baseUrl: string;
  let limitedUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const docteur = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const call = async (
    method: string,
    path: string,
    who: string | null = token(awa),
    url = baseUrl,
    body?: unknown,
  ) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const create = async (who = token(awa), url = baseUrl) => {
    const res = await call('POST', '/shares', who, url, {
      categories: ['GLUCOSE_HISTORY', 'MEALS'],
      duration: 'MIN_30',
    });
    expect(res.status).toBe(201);
    return res.body as unknown as CreateShareResponse;
  };
  const rotate = (sessionId: string, who: string | null = token(awa), url = baseUrl) =>
    call('GET', `/shares/${sessionId}/token`, who, url);
  const rotated = async (sessionId: string) => {
    const res = await rotate(sessionId);
    expect(res.status).toBe(200);
    return res.body as unknown as ShareTokenDto;
  };
  /** Jetons encore utilisables d'une session (jamais utilisés, pas expirés) : leurs hash. */
  const validHashes = async (sessionId: string) =>
    (
      await prisma.shareToken.findMany({
        where: { sessionId, usedAt: null, expiresAt: { gt: new Date() } },
        select: { tokenHash: true },
      })
    ).map((t) => t.tokenHash);
  /** Un scan, tel que la route du médecin (L5-03) le fera : dans sa propre transaction. */
  const consume = (qr: unknown, now = new Date()) =>
    prisma.$transaction((tx) => consumeShareToken(tx, qr, now));

  /** Application de test ; `throttle` : avec la limite de débit (sinon, les scénarios s'y heurteraient). */
  const build = async (throttle: boolean) => {
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
        ...(throttle ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }] : []),
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    const nest = moduleRef.createNestApplication();
    nest.useGlobalFilters(new AllExceptionsFilter());
    await nest.listen(0, '127.0.0.1');
    return {
      nest,
      url: `http://127.0.0.1:${(nest.getHttpServer().address() as AddressInfo).port}`,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: DB_URL });
    const profile = (firstName: string) => ({
      create: {
        firstName,
        lastName: 'Test',
        birthDate: new Date('1990-01-01'),
        sex: 'F',
        diabetesType: 'TYPE_2' as const,
      },
    });
    const user = (id: string, role: 'PATIENT' | 'DOCTOR') => ({
      id,
      email: `rotate-${id}@afyabora.test`,
      passwordHash: 'non-utilise',
      role,
      emailVerifiedAt: new Date(),
    });
    await prisma.user.create({ data: { ...user(awa, 'PATIENT'), patientProfile: profile('Awa') } });
    await prisma.user.create({
      data: { ...user(paul, 'PATIENT'), patientProfile: profile('Paul') },
    });
    await prisma.user.create({ data: user(docteur, 'DOCTOR') });
    ({ nest: app, url: baseUrl } = await build(false));
    ({ nest: limited, url: limitedUrl } = await build(true));
  });

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await prisma?.user.deleteMany({ where: { id: { in: [awa, paul, docteur] } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
  });

  describe('rotation : GET /shares/:id/token', () => {
    it('200 : un NOUVEAU jeton, au format du contrat, valable 60 s', async () => {
      const created = await create();
      const before = Date.now();
      const next = await rotated(created.session.id);
      expect(shareTokenSchema.parse(next)).toEqual(next);
      expect(next.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(next.token).not.toBe(created.token.token);
      const life = Date.parse(next.expiresAt) - before;
      expect(life).toBeGreaterThanOrEqual(59_000);
      expect(life).toBeLessThanOrEqual(61_000);
    });

    it('le nouveau jeton REMPLACE l’ancien : un seul QR valable, et seul son hash est en base', async () => {
      const created = await create();
      const next = await rotated(created.session.id);
      expect(await validHashes(created.session.id)).toEqual([sha256(next.token)]);
      const old = await prisma.shareToken.findUnique({
        where: { tokenHash: sha256(created.token.token) },
      });
      expect(old?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(old?.usedAt).toBeNull(); // remplacé, pas « utilisé »
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM "ShareToken" t WHERE row_to_json(t)::text LIKE $1`,
        `%${next.token}%`,
      );
      expect(Number(rows[0]?.n)).toBe(0);
    });

    it('la session reste EN ATTENTE ; rotations successives : chaque fois un seul jeton valable', async () => {
      const created = await create();
      let last = created.token;
      for (let i = 0; i < 5; i++) {
        const next = await rotated(created.session.id);
        expect(next.token).not.toBe(last.token);
        expect(await validHashes(created.session.id)).toEqual([sha256(next.token)]);
        last = next;
      }
      expect(await prisma.shareToken.count({ where: { sessionId: created.session.id } })).toBe(6);
      expect(
        (await prisma.shareSession.findUnique({ where: { id: created.session.id } }))?.status,
      ).toBe('PENDING');
    });

    it('deux écrans ouverts : 10 rotations EN MÊME TEMPS ⇒ toutes 200, un seul jeton reste valable', async () => {
      const created = await create();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => rotate(created.session.id)),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      const valid = await validHashes(created.session.id);
      expect(valid).toHaveLength(1);
      expect(results.map((r) => sha256(String(r.body.token)))).toContain(valid[0]);
    });

    it.each(['ACTIVE', 'EXPIRED', 'REVOKED'] as const)(
      'session %s : 409 SESSION_NOT_PENDING, aucun jeton créé',
      async (status) => {
        const created = await create();
        await prisma.shareSession.update({ where: { id: created.session.id }, data: { status } });
        const res = await rotate(created.session.id);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SESSION_NOT_PENDING');
        expect(res.body.message).toBe(
          "Ce partage n'attend plus de scan : il a déjà été ouvert, a expiré ou a été arrêté.",
        );
        expect(await prisma.shareToken.count({ where: { sessionId: created.session.id } })).toBe(1);
      },
    );

    it('QR déjà consommé (scan en cours) : 409 SESSION_NOT_PENDING, plus aucun nouveau jeton', async () => {
      const created = await create();
      expect(await consume(created.token.token)).not.toBeNull();
      const res = await rotate(created.session.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SESSION_NOT_PENDING');
      expect(await validHashes(created.session.id)).toEqual([]);
    });

    it('session d’un AUTRE patient : 404 (on ne révèle pas qu’elle existe), son QR reste valable', async () => {
      const paulShare = await create(token(paul));
      const res = await rotate(paulShare.session.id, token(awa));
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session de partage introuvable.');
      expect(await validHashes(paulShare.session.id)).toEqual([sha256(paulShare.token.token)]);
    });

    it('session inconnue : 404 ; identifiant qui n’est pas un UUID : 400 sur « id »', async () => {
      expect((await rotate(randomUUID())).status).toBe(404);
      const bad = await rotate('pas-un-uuid');
      expect(bad.status).toBe(400);
      expect((bad.body.issues as { path: string }[]).map((i) => i.path)).toEqual(['id']);
    });

    it('sans jeton : 401 ; médecin : 403 (seul le patient affiche son QR)', async () => {
      const created = await create();
      expect((await rotate(created.session.id, null)).status).toBe(401);
      expect((await rotate(created.session.id, token(docteur, 'DOCTOR'))).status).toBe(403);
    });

    it('limite : 429 à la 31e rotation en une minute', async () => {
      const created = await create(token(paul), limitedUrl);
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) {
        statuses.push((await rotate(created.session.id, token(paul), limitedUrl)).status);
      }
      expect(statuses.slice(0, 30)).toEqual(Array(30).fill(200));
      expect(statuses[30]).toBe(429);
    });
  });

  describe('usage unique : consumeShareToken', () => {
    it('un jeton valable est consommé : la session est renvoyée, le jeton est marqué utilisé', async () => {
      const created = await create();
      const now = new Date();
      expect(await consume(created.token.token, now)).toEqual({
        sessionId: created.session.id,
        patientId: awa,
        categories: ['GLUCOSE_HISTORY', 'MEALS'],
        duration: 'MIN_30',
      });
      const stored = await prisma.shareToken.findUnique({
        where: { tokenHash: sha256(created.token.token) },
      });
      expect(stored?.usedAt?.toISOString()).toBe(now.toISOString());
    });

    it('même QR scanné deux fois : le second est refusé', async () => {
      const created = await create();
      expect(await consume(created.token.token)).not.toBeNull();
      expect(await consume(created.token.token)).toBeNull();
    });

    it('jeton de plus de 60 s refusé ; à 59 s il passe encore', async () => {
      const created = await create();
      const issuedAt = Date.parse(created.token.expiresAt) - 60_000;
      expect(await consume(created.token.token, new Date(issuedAt + 60_000))).toBeNull();
      expect(await consume(created.token.token, new Date(issuedAt + 61_000))).toBeNull();
      expect(await consume(created.token.token, new Date(issuedAt + 59_000))).not.toBeNull();
    });

    it('jeton remplacé par une rotation : refusé ; le nouveau passe', async () => {
      const created = await create();
      const next = await rotated(created.session.id);
      expect(await consume(created.token.token)).toBeNull();
      expect(await consume(next.token)).not.toBeNull();
    });

    it('un QR consommé ferme la session à tout autre jeton encore valable', async () => {
      const created = await create();
      // Second jeton valable (impossible par les routes, qui n'en laissent qu'un) : le pire cas.
      const spare = 'S'.repeat(43);
      await prisma.shareToken.create({
        data: {
          sessionId: created.session.id,
          tokenHash: sha256(spare),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect(await consume(created.token.token)).not.toBeNull();
      expect(await consume(spare)).toBeNull();
    });

    it.each(['ACTIVE', 'EXPIRED', 'REVOKED'] as const)(
      'session %s : jeton refusé, et pas marqué utilisé',
      async (status) => {
        const created = await create();
        await prisma.shareSession.update({ where: { id: created.session.id }, data: { status } });
        expect(await consume(created.token.token)).toBeNull();
        const stored = await prisma.shareToken.findUnique({
          where: { tokenHash: sha256(created.token.token) },
        });
        expect(stored?.usedAt).toBeNull();
      },
    );

    it.each([
      ['inconnu (bien formé)', 'Z'.repeat(43)],
      ['mal formé', 'pas un jeton'],
      ['hash au lieu du jeton', 'HASH'],
      ['vide', ''],
      ['pas du texte', 42],
    ])('jeton %s : refusé', async (_label, qr) => {
      const created = await create();
      const value = qr === 'HASH' ? sha256(created.token.token) : qr;
      expect(await consume(value)).toBeNull();
      expect(await validHashes(created.session.id)).toEqual([sha256(created.token.token)]);
    });

    it('deux scans EN MÊME TEMPS (10 à la fois) : un seul réussit', async () => {
      const created = await create();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => consume(created.token.token)),
      );
      expect(results.filter((r) => r !== null)).toHaveLength(1);
      expect(
        await prisma.shareToken.count({
          where: { sessionId: created.session.id, usedAt: { not: null } },
        }),
      ).toBe(1);
    });

    it('scan et rotation EN MÊME TEMPS (20 fois) : jamais d’erreur, jamais deux jetons utilisés', async () => {
      for (let i = 0; i < 20; i++) {
        const created = await create();
        const [scan, rotation] = await Promise.all([
          consume(created.token.token),
          rotate(created.session.id),
        ]);
        // Scan passé d'abord : la rotation est refusée (409). Rotation passée d'abord : son jeton est le
        // seul valable, et le scan de l'ancien n'a réussi que s'il était arrivé avant elle (il ferme alors
        // le nouveau). Dans tous les cas : jamais d'erreur 500, au plus UN jeton utilisé, et après un scan
        // réussi, plus aucun jeton valable.
        expect([200, 409]).toContain(rotation.status);
        const used = await prisma.shareToken.count({
          where: { sessionId: created.session.id, usedAt: { not: null } },
        });
        expect(used).toBe(scan === null ? 0 : 1);
        if (scan !== null) expect(await validHashes(created.session.id)).toEqual([]);
        else expect(rotation.status).toBe(200);
      }
    });
  });
});
