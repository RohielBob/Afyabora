// Ticket L5-01 : POST /shares (session de partage + premier QR), sur une VRAIE base PostgreSQL : vrai serveur
// HTTP, vraies gardes JWT et rôles, vrai Prisma. La sécurité se vérifie dans la base elle-même (seul le hash
// du jeton y est), et la concurrence (double appui) a besoin d'une vraie base.
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
import { createShareResponseSchema, type CreateShareResponse } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { SharingModule } from '../src/modules/sharing/sharing.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const ALL = ['GLUCOSE_HISTORY', 'TREATMENTS', 'MEALS', 'ACTIVITY', 'AI_SUMMARY'];

describe.skipIf(!isTestDatabase(DB_URL))('L5-01 : POST /shares (vraie base PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let limited: INestApplication;
  let baseUrl: string;
  let limitedUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const sansProfil = randomUUID();
  const docteur = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const post = async (body: unknown, who: string | null = token(awa), url = baseUrl) => {
    const res = await fetch(`${url}/shares`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const create = async (
    body: unknown = { categories: ALL, duration: 'MIN_5' },
    who = token(awa),
  ) => {
    const res = await post(body, who);
    expect(res.status).toBe(201);
    return res.body as unknown as CreateShareResponse;
  };

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
      email: `share-${id}@afyabora.test`,
      passwordHash: 'non-utilise',
      role,
      emailVerifiedAt: new Date(),
    });
    await prisma.user.create({ data: { ...user(awa, 'PATIENT'), patientProfile: profile('Awa') } });
    await prisma.user.create({
      data: { ...user(paul, 'PATIENT'), patientProfile: profile('Paul') },
    });
    await prisma.user.create({ data: user(sansProfil, 'PATIENT') });
    await prisma.user.create({ data: user(docteur, 'DOCTOR') });
    ({ nest: app, url: baseUrl } = await build(false));
    ({ nest: limited, url: limitedUrl } = await build(true));
  });

  afterAll(async () => {
    await app?.close();
    await limited?.close();
    await prisma?.user.deleteMany({ where: { id: { in: [awa, paul, sansProfil, docteur] } } });
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.shareSession.deleteMany({ where: { patientId: { in: [awa, paul] } } });
  });

  describe('création', () => {
    it('201 : session EN ATTENTE de scan + premier jeton, au format du contrat', async () => {
      const before = Date.now();
      const created = await create({
        categories: ['MEALS', 'GLUCOSE_HISTORY'],
        duration: 'MIN_30',
      });
      expect(createShareResponseSchema.parse(created)).toEqual(created);
      expect(created.session).toMatchObject({
        status: 'PENDING',
        // Ordre stable, quel que soit l'ordre des cases cochées.
        categories: ['GLUCOSE_HISTORY', 'MEALS'],
        duration: 'MIN_30',
        claimedAt: null, // la durée démarre au scan (L5-03)
        expiresAt: null,
        revokedAt: null,
        doctor: null,
      });
      const tokenLife = Date.parse(created.token.expiresAt) - before;
      expect(tokenLife).toBeGreaterThanOrEqual(59_000);
      expect(tokenLife).toBeLessThanOrEqual(61_000);
    });

    it('en base : la session du patient et UN jeton, dont seul le hash SHA-256 est gardé', async () => {
      const created = await create();
      const sessions = await prisma.shareSession.findMany({
        where: { patientId: awa },
        include: { tokens: true },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe(created.session.id);
      expect(sessions[0]?.tokens).toHaveLength(1);
      const stored = sessions[0]?.tokens[0];
      expect(stored?.tokenHash).toBe(
        createHash('sha256').update(created.token.token).digest('hex'),
      );
      expect(stored?.usedAt).toBeNull();
      expect(stored?.expiresAt.toISOString()).toBe(created.token.expiresAt);
    });

    it('le jeton lui-même n’est écrit NULLE PART en base (aucune colonne, aucune table de partage)', async () => {
      const { token: qr } = await create();
      for (const table of ['ShareSession', 'ShareToken', 'AccessLog']) {
        const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*) AS n FROM "${table}" t WHERE row_to_json(t)::text LIKE $1`,
          `%${qr.token}%`,
        );
        expect(Number(rows[0]?.n)).toBe(0);
      }
    });

    it('deux sessions : deux jetons différents', async () => {
      const a = await create();
      const b = await create();
      expect(a.token.token).not.toBe(b.token.token);
      expect(a.session.id).not.toBe(b.session.id);
    });

    it.each(['MIN_5', 'MIN_30', 'HOUR_1', 'CONSULTATION'])(
      'durée %s acceptée',
      async (duration) => {
        expect((await create({ categories: ['GLUCOSE_HISTORY'], duration })).session.duration).toBe(
          duration,
        );
      },
    );
  });

  describe('un seul QR en attente à la fois', () => {
    it('une nouvelle session remplace celle encore en attente : l’ancienne expire, son jeton aussi', async () => {
      const first = await create();
      const second = await create();
      const old = await prisma.shareSession.findUnique({
        where: { id: first.session.id },
        include: { tokens: true },
      });
      expect(old?.status).toBe('EXPIRED');
      expect(old?.tokens[0]?.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.parse(second.session.createdAt),
      );
      expect(
        (await prisma.shareSession.findUnique({ where: { id: second.session.id } }))?.status,
      ).toBe('PENDING');
    });

    it('une session déjà ouverte par un médecin (ACTIVE) n’est pas touchée', async () => {
      const first = await create();
      await prisma.shareSession.update({
        where: { id: first.session.id },
        data: { status: 'ACTIVE', claimedAt: new Date() },
      });
      await create();
      expect(
        (await prisma.shareSession.findUnique({ where: { id: first.session.id } }))?.status,
      ).toBe('ACTIVE');
    });

    it('les sessions d’un AUTRE patient ne sont pas touchées', async () => {
      const paulSession = await create(undefined, token(paul));
      await create();
      expect(
        (await prisma.shareSession.findUnique({ where: { id: paulSession.session.id } }))?.status,
      ).toBe('PENDING');
    });

    it('double appui : 10 créations EN MÊME TEMPS ⇒ une seule session reste en attente', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => post({ categories: ALL, duration: 'MIN_5' })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
      const byStatus = await prisma.shareSession.groupBy({
        by: ['status'],
        where: { patientId: awa },
        _count: true,
      });
      expect(Object.fromEntries(byStatus.map((g) => [g.status, g._count]))).toEqual({
        PENDING: 1,
        EXPIRED: 9,
      });
    });
  });

  describe('refus', () => {
    it.each([
      [{ categories: [], duration: 'MIN_5' }, 'categories'],
      [{ categories: ['MEALS', 'MEALS'], duration: 'MIN_5' }, 'categories'],
      [{ categories: ['DOSSIER_COMPLET'], duration: 'MIN_5' }, 'categories.0'],
      [{ categories: ['MEALS'], duration: 'JOUR_1' }, 'duration'],
      [{ categories: ['MEALS'] }, 'duration'],
      [{}, 'categories'],
    ])('entrée invalide %j : 400 sur « %s », rien n’est créé', async (body, path) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((res.body.issues as { path: string }[]).map((i) => i.path)).toContain(path);
      expect(await prisma.shareSession.count({ where: { patientId: awa } })).toBe(0);
    });

    it('sans jeton : 401 ; médecin : 403 (seul un patient partage ses données)', async () => {
      expect((await post({ categories: ALL, duration: 'MIN_5' }, null)).status).toBe(401);
      expect(
        (await post({ categories: ALL, duration: 'MIN_5' }, token(docteur, 'DOCTOR'))).status,
      ).toBe(403);
    });

    it('patient sans profil médical : 400 explicite ; compte supprimé : 401', async () => {
      const noProfile = await post({ categories: ALL, duration: 'MIN_5' }, token(sansProfil));
      expect(noProfile.status).toBe(400);
      expect(noProfile.body.message).toBe(
        'Complétez votre profil médical avant de partager vos données.',
      );
      expect((await post({ categories: ALL, duration: 'MIN_5' }, token(randomUUID()))).status).toBe(
        401,
      );
    });

    it('limite : 429 à la 11e création en une minute', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await post({ categories: ALL, duration: 'MIN_5' }, token(paul), limitedUrl)).status,
        );
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
      expect(statuses[10]).toBe(429);
    });
  });
});
