// Ticket L8-09 : tests de conflits et d'idempotence de la synchronisation, sur une VRAIE base PostgreSQL.
// Les tests L8-04 / L8-05 utilisent une base simulée : elle ne reproduit ni les vraies contraintes
// d'unicité, ni les envois SIMULTANÉS, ni la précision réelle des dates. Ici : vrai serveur HTTP, vraies
// gardes JWT et rôles, vrais services, vrai Prisma sur PostgreSQL.
//
// SÉCURITÉ : ces tests écrivent et effacent des données. Ils ne tournent QUE si DATABASE_URL désigne une
// base dont le nom finit par « _test » (CI : glyka_test ; en local : base créée exprès, voir le README du
// module). Sinon ils sont ignorés : la base de développement n'est jamais touchée.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { SyncModule } from '../src/modules/sync/sync.module';
import {
  CLOCK_AHEAD_REASON,
  ID_TAKEN_REASON,
  OP_ID_TAKEN_REASON,
} from '../src/modules/sync/sync.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

describe('garde-fou de la base des tests d’intégration', () => {
  it('seule une base nommée « …_test » est acceptée', () => {
    expect(isTestDatabase('postgresql://u:p@localhost:5432/glyka_test')).toBe(true);
    expect(isTestDatabase('postgresql://u:p@localhost:5432/glyka_test?schema=public')).toBe(true);
    expect(isTestDatabase('postgresql://u:p@localhost:5432/glyka')).toBe(false);
    expect(isTestDatabase('postgresql://u:p@localhost:5432/glyka_test_old')).toBe(false);
    expect(isTestDatabase('postgresql://u:p@db_test:5432/glyka')).toBe(false); // l'hôte ne compte pas
    expect(isTestDatabase(undefined)).toBe(false);
    expect(isTestDatabase('pas une url')).toBe(false);
  });
});

const DB_URL = process.env.DATABASE_URL;
const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const FIELD_KEY = randomBytes(32).toString('base64');
const MINUTE = 60_000;

type OpResult = { opId: string; result: string; reason?: string };
type Pulled = {
  measurements: { id: string; valueMgDl: number; note: string | null; deletedAt: string | null }[];
  events: { id: string; deletedAt: string | null }[];
  nextCursor: string | null;
  hasMore: boolean;
};

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const measure = (id: string = randomUUID(), over: Record<string, unknown> = {}) => ({
  id,
  value: 110,
  unit: 'MG_DL',
  measuredAt: iso(-60 * MINUTE),
  context: 'FASTING',
  note: 'Avant le petit-déjeuner',
  ...over,
});
const upsert = (
  payload: { id: string } & Record<string, unknown>,
  at = iso(-MINUTE),
  opId = randomUUID(),
) => ({
  opId,
  entity: 'measurement',
  type: 'upsert',
  entityId: payload.id,
  clientUpdatedAt: at,
  payload,
});
const remove = (entityId: string, at = iso(-MINUTE), opId = randomUUID()) => ({
  opId,
  entity: 'measurement',
  type: 'delete',
  entityId,
  clientUpdatedAt: at,
});
const meal = (id: string = randomUUID()) => ({
  opId: randomUUID(),
  entity: 'event',
  type: 'upsert',
  entityId: id,
  clientUpdatedAt: iso(-MINUTE),
  payload: { id, type: 'MEAL', occurredAt: iso(-90 * MINUTE), label: 'Déjeuner', details: 'riz' },
});

describe.skipIf(!isTestDatabase(DB_URL))(
  'L8-09 : synchronisation sur une vraie base PostgreSQL',
  () => {
    let app: INestApplication;
    let prisma: PrismaClient;
    let baseUrl: string;
    const jwt = new JwtService({ secret: SECRET });
    const awa = randomUUID();
    const paul = randomUUID();
    const device = randomUUID();
    const token = (sub: string) => jwt.sign({ sub, role: 'PATIENT' });

    const push = async (ops: unknown[], who = awa, deviceId = device) => {
      const res = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token(who)}` },
        body: JSON.stringify({ deviceId, ops }),
      });
      expect(res.status).toBe(200);
      return ((await res.json()) as { results: OpResult[] }).results;
    };
    const outcomes = async (ops: unknown[], who = awa) =>
      (await push(ops, who)).map((r) => r.result);
    const pull = async (cursor: string | null, limit = 200, who = awa): Promise<Pulled> => {
      const q = `limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(`${baseUrl}/sync/pull?${q}`, {
        headers: { authorization: `Bearer ${token(who)}` },
      });
      expect(res.status).toBe(200);
      return (await res.json()) as Pulled;
    };
    /** Tout le flux depuis `cursor`, page par page, comme le téléphone. */
    const pullAll = async (cursor: string | null, limit = 200, who = awa) => {
      const ids: string[] = [];
      let pages = 0;
      for (;;) {
        const page = await pull(cursor, limit, who);
        pages++;
        ids.push(...page.measurements.map((m) => m.id), ...page.events.map((e) => e.id));
        cursor = page.nextCursor;
        if (!page.hasMore) return { ids, cursor, pages };
        if (pages > 100) throw new Error('pagination sans fin');
      }
    };
    const row = (id: string) => prisma.measurement.findUnique({ where: { id } });

    beforeAll(async () => {
      prisma = new PrismaClient({ datasourceUrl: DB_URL });
      for (const [id, name] of [
        [awa, 'Awa'],
        [paul, 'Paul'],
      ] as const) {
        await prisma.user.create({
          data: {
            id,
            email: `it-${id}@afyabora.test`,
            passwordHash: 'non-utilise',
            role: 'PATIENT',
            emailVerifiedAt: new Date(),
            patientProfile: {
              create: {
                firstName: name,
                lastName: 'Test',
                birthDate: new Date('1990-01-01'),
                sex: 'F',
                diabetesType: 'TYPE_2',
              },
            },
          },
        });
      }
      const moduleRef = await Test.createTestingModule({
        imports: [
          JwtModule.register({ global: true, secret: SECRET }),
          {
            module: class IntegrationInfraModule {},
            global: true,
            providers: [
              { provide: PrismaService, useValue: prisma },
              {
                provide: ConfigService,
                useValue: {
                  get: () => undefined,
                  getOrThrow: (key: string) => {
                    if (key === 'FIELD_ENCRYPTION_KEY') return FIELD_KEY;
                    throw new Error(`Configuration absente du test : ${key}`);
                  },
                },
              },
            ],
            exports: [PrismaService, ConfigService],
          },
          SyncModule,
        ],
        providers: [
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalFilters(new AllExceptionsFilter());
      await app.listen(0, '127.0.0.1');
      baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await app?.close();
      // Les profils, mesures, événements et journaux de synchronisation partent avec les comptes (cascade).
      await prisma?.user.deleteMany({ where: { id: { in: [awa, paul] } } });
      await prisma?.$disconnect();
    });

    beforeEach(async () => {
      for (const patientId of [awa, paul]) {
        await prisma.syncOpLog.deleteMany({ where: { patientId } });
        await prisma.measurement.deleteMany({ where: { patientId } });
        await prisma.lifeEvent.deleteMany({ where: { patientId } });
      }
    });

    describe('rejeu et doublons (idempotence)', () => {
      it('le même lot envoyé deux fois : appliqué une fois, puis DUPLICATE ; aucune ligne en double', async () => {
        const ops = [upsert(measure()), upsert(measure()), upsert(measure()), meal()];
        expect(await outcomes(ops)).toEqual(['APPLIED', 'APPLIED', 'APPLIED', 'APPLIED']);
        expect(await outcomes(ops)).toEqual(['DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
        expect(await prisma.measurement.count({ where: { patientId: awa } })).toBe(3);
        expect(await prisma.lifeEvent.count({ where: { patientId: awa } })).toBe(1);
        expect(await prisma.syncOpLog.count({ where: { patientId: awa } })).toBe(4);
      });

      it('le même lot envoyé 5 fois EN MÊME TEMPS (réseau qui renvoie) : jamais d’erreur ni de doublon', async () => {
        const ops = Array.from({ length: 20 }, () => upsert(measure()));
        const all = await Promise.all(Array.from({ length: 5 }, () => push(ops)));
        for (const results of all) {
          expect(results).toHaveLength(20);
          for (const r of results) expect(['APPLIED', 'DUPLICATE']).toContain(r.result);
        }
        expect(await prisma.measurement.count({ where: { patientId: awa } })).toBe(20);
        expect(await prisma.syncOpLog.count({ where: { patientId: awa } })).toBe(20);
        // Rejoué ensuite : tout est DUPLICATE.
        expect(new Set(await outcomes(ops))).toEqual(new Set(['DUPLICATE']));
      });

      it('la même donnée envoyée par deux opérations différentes (deux appareils) : une seule ligne', async () => {
        const payload = measure();
        const at = iso(-MINUTE);
        expect(await outcomes([upsert(payload, at)])).toEqual(['APPLIED']);
        // Même instant : appliqué sans dégât (rejeu sûr) ; toujours une seule mesure.
        expect(await outcomes([upsert(payload, at)])).toEqual(['APPLIED']);
        expect(await prisma.measurement.count({ where: { patientId: awa } })).toBe(1);
      });

      it('la même création envoyée EN MÊME TEMPS par 10 appareils : une seule ligne, jamais d’erreur', async () => {
        // 10 tours de 10 envois simultanés : la collision « créée entre-temps » (P2002) arrive à coup sûr.
        for (let round = 0; round < 10; round++) {
          const payload = measure();
          const at = iso(-MINUTE);
          const all = await Promise.all(
            Array.from({ length: 10 }, () => push([upsert(payload, at)], awa, randomUUID())),
          );
          expect(all.map((results) => results[0]?.result)).toEqual(Array(10).fill('APPLIED'));
          expect(await prisma.measurement.count({ where: { id: payload.id } })).toBe(1);
        }
      });

      it('une opération invalide au milieu d’un lot : les autres sont appliquées', async () => {
        const before = upsert(measure());
        const after = upsert(measure());
        const results = await push([before, { ...upsert(measure()), payload: { id: 'x' } }, after]);
        expect(results.map((r) => r.result)).toEqual(['APPLIED', 'REJECTED', 'APPLIED']);
        expect(await prisma.measurement.count({ where: { patientId: awa } })).toBe(2);
      });
    });

    describe('suppression faite hors-ligne', () => {
      it('propagée au serveur : pierre tombale, note effacée, reçue par les autres appareils', async () => {
        const payload = measure();
        await push([upsert(payload, iso(-10 * MINUTE))]);
        const { cursor } = await pullAll(null);
        expect(await outcomes([remove(payload.id, iso(-2 * MINUTE))])).toEqual(['APPLIED']);
        const stored = await row(payload.id);
        expect(stored?.deletedAt).not.toBeNull();
        expect(stored?.noteEncrypted).toBeNull();
        // Un autre appareil reçoit la suppression.
        const page = await pull(cursor);
        expect(page.measurements).toEqual([
          expect.objectContaining({ id: payload.id, note: null, deletedAt: expect.any(String) }),
        ]);
      });

      it('créée puis supprimée hors-ligne, envoyées dans le même lot : la suppression est propagée', async () => {
        const payload = measure();
        expect(
          await outcomes([upsert(payload, iso(-3 * MINUTE)), remove(payload.id, iso(-2 * MINUTE))]),
        ).toEqual(['APPLIED', 'APPLIED']);
        expect((await row(payload.id))?.deletedAt).not.toBeNull();
      });

      it('supprimer une donnée inconnue : APPLIED, rien n’est créé ; rejouée : DUPLICATE', async () => {
        const op = remove(randomUUID());
        expect(await outcomes([op])).toEqual(['APPLIED']);
        expect(await prisma.measurement.count({ where: { patientId: awa } })).toBe(0);
        expect(await outcomes([op])).toEqual(['DUPLICATE']);
      });

      it('une suppression est définitive : une modification plus récente ensuite est refusée (conflit)', async () => {
        const payload = measure();
        await push([upsert(payload, iso(-10 * MINUTE)), remove(payload.id, iso(-5 * MINUTE))]);
        expect(await outcomes([upsert({ ...payload, value: 200 }, iso(-MINUTE))])).toEqual([
          'CONFLICT_SERVER_WINS',
        ]);
        const stored = await row(payload.id);
        expect(stored?.deletedAt).not.toBeNull();
        expect(stored?.valueMgDl).toBe(110);
      });

      it('suppression hors-ligne PLUS ANCIENNE qu’une modification faite ailleurs : la modification gagne', async () => {
        const payload = measure();
        await push([upsert(payload, iso(-10 * MINUTE))]);
        await push([upsert({ ...payload, value: 150 }, iso(-2 * MINUTE))], awa, randomUUID());
        expect(await outcomes([remove(payload.id, iso(-5 * MINUTE))])).toEqual([
          'CONFLICT_SERVER_WINS',
        ]);
        const stored = await row(payload.id);
        expect(stored?.deletedAt).toBeNull();
        expect(stored?.valueMgDl).toBe(150);
      });
    });

    describe('dérive d’horloge du téléphone', () => {
      it('horloge en avance de 4 min : acceptée ; de 6 min : refusée, rien n’est écrit', async () => {
        const ok = measure();
        const ahead = measure();
        const results = await push([upsert(ok, iso(4 * MINUTE)), upsert(ahead, iso(6 * MINUTE))]);
        expect(results.map((r) => r.result)).toEqual(['APPLIED', 'REJECTED']);
        expect(results[1]?.reason).toBe(CLOCK_AHEAD_REASON);
        expect(await row(ahead.id)).toBeNull();
        // Refusée : pas notée dans le journal, elle pourra être réexaminée plus tard.
        expect(await prisma.syncOpLog.count({ where: { patientId: awa } })).toBe(1);
      });

      it('mesure datée de plus de 5 min dans le futur : refusée ; 4 min : acceptée', async () => {
        const results = await push([
          upsert(measure(randomUUID(), { measuredAt: iso(6 * MINUTE) })),
          upsert(measure(randomUUID(), { measuredAt: iso(4 * MINUTE) })),
        ]);
        expect(results.map((r) => r.result)).toEqual(['REJECTED', 'APPLIED']);
      });

      it('horloge en RETARD : une modification plus ancienne que la version du serveur ne l’écrase pas', async () => {
        const payload = measure();
        await push([upsert({ ...payload, value: 150 }, iso(-MINUTE))]);
        // Téléphone en retard de 10 minutes.
        expect(await outcomes([upsert({ ...payload, value: 90 }, iso(-11 * MINUTE))])).toEqual([
          'CONFLICT_SERVER_WINS',
        ]);
        expect((await row(payload.id))?.valueMgDl).toBe(150);
      });
    });

    describe('« la dernière écriture gagne », même avec des envois simultanés', () => {
      it('8 versions envoyées EN MÊME TEMPS, dans le désordre : la plus récente gagne, à chaque fois', async () => {
        for (let round = 0; round < 5; round++) {
          const payload = measure();
          await push([upsert(payload, iso(-30 * MINUTE))]);
          const versions = Array.from({ length: 8 }, (_, i) => ({
            value: 100 + i * 10 + round,
            at: iso(-20 * MINUTE + i * MINUTE),
          }));
          const shuffled = [...versions].sort(() => Math.random() - 0.5);
          await Promise.all(
            shuffled.map((v) =>
              push([upsert({ ...payload, value: v.value }, v.at)], awa, randomUUID()),
            ),
          );
          const newest = versions[versions.length - 1] as { value: number; at: string };
          const stored = await row(payload.id);
          expect(stored?.valueMgDl).toBe(newest.value);
          expect(stored?.clientUpdatedAt.toISOString()).toBe(newest.at);
        }
      });
    });

    describe('propriété des données', () => {
      it('l’identifiant d’une mesure d’Awa envoyé par Paul : refusé, rien n’est changé ni révélé', async () => {
        const payload = measure();
        await push([upsert(payload)]);
        const results = await push([upsert({ ...payload, value: 300 }, iso(0))], paul);
        expect(results[0]).toMatchObject({ result: 'REJECTED', reason: ID_TAKEN_REASON });
        expect((await row(payload.id))?.valueMgDl).toBe(110);
        // Suppression tentée par Paul : refusée aussi.
        expect((await push([remove(payload.id, iso(0))], paul))[0]?.result).toBe('REJECTED');
        expect((await row(payload.id))?.deletedAt).toBeNull();
      });

      it('l’opId d’Awa réutilisé par Paul : refusé ; Paul ne reçoit jamais les données d’Awa', async () => {
        const op = upsert(measure());
        await push([op]);
        const results = await push([{ ...upsert(measure()), opId: op.opId }], paul);
        expect(results[0]).toMatchObject({ result: 'REJECTED', reason: OP_ID_TAKEN_REASON });
        const { ids } = await pullAll(null, 200, paul);
        expect(ids).toEqual([]);
      });
    });

    describe('réception (pull) sur la vraie base', () => {
      it('import de 250 mesures à la MÊME date de modification : reçues par pages de 40, chacune une fois', async () => {
        const sameInstant = new Date(Date.now() - 2 * MINUTE);
        const ids = Array.from({ length: 250 }, () => randomUUID());
        await prisma.measurement.createMany({
          data: ids.map((id, i) => ({
            id,
            patientId: awa,
            valueMgDl: 100 + (i % 50),
            originalValue: 100 + (i % 50),
            originalUnit: 'MG_DL',
            measuredAt: new Date(Date.now() - (i + 10) * MINUTE),
            source: 'IMPORT',
            clientUpdatedAt: sameInstant,
            updatedAt: sameInstant,
          })),
        });
        expect(
          await prisma.measurement.groupBy({ by: ['updatedAt'], where: { patientId: awa } }),
        ).toHaveLength(1);

        const first = await pullAll(null, 40);
        expect(first.pages).toBe(7);
        expect(first.ids).toHaveLength(250);
        expect(new Set(first.ids).size).toBe(250);
        expect(new Set(first.ids)).toEqual(new Set(ids));

        // Ensuite : une seule modification ⇒ un seul élément reçu.
        await push([upsert({ ...measure(ids[0]), value: 130 }, iso(-10_000))]);
        const next = await pullAll(first.cursor, 40);
        expect(next.ids).toEqual([ids[0]]);
        // Et plus rien de nouveau ensuite (au plus une relecture de la marge de 5 s).
        const idle = await pullAll(next.cursor, 40);
        expect(idle.ids.filter((id) => id !== ids[0])).toEqual([]);
      });
    });
  },
);
