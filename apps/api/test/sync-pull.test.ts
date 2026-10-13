// Tests du ticket L8-05 : GET /sync/pull (synchronisation hors-ligne, réception). Vrai serveur HTTP (port 0),
// vraies gardes JWT et rôles, vrais services ; base SIMULÉE en mémoire qui applique réellement le filtre du
// patient, les conditions du curseur (`updatedAt`, `id`) et le tri croissant.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { syncPullResponseSchema } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { SyncModule } from '../src/modules/sync/sync.module';
import {
  PULL_OVERLAP_MS,
  decodeSyncCursor,
  encodeSyncCursor,
} from '../src/modules/sync/sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const FIELD_KEY = randomBytes(32).toString('base64');
/** Heure de référence des lignes « anciennes » (bien plus de 5 s avant l'heure du serveur). */
const T0 = new Date('2026-01-01T08:00:00.000Z').getTime();
/** Heure de référence des lignes « toutes récentes » (dans la marge) : relative à l'heure réelle. */
const recent = () => Date.now() - 30_000;

// ---------- Fausse base ----------
type Row = Record<string, unknown> & { id: string; patientId: string; updatedAt: Date };
let measurements: Row[] = [];
let events: Row[] = [];

type Where = {
  patientId: string;
  updatedAt?: { gte?: Date; gt?: Date } | Date;
  id?: { gt: string };
  OR?: Where[];
};
const matches = (row: Row, w: Partial<Where>): boolean => {
  if (w.patientId !== undefined && row.patientId !== w.patientId) return false;
  if (w.updatedAt instanceof Date) {
    if (row.updatedAt.getTime() !== w.updatedAt.getTime()) return false;
  } else if (w.updatedAt) {
    if (w.updatedAt.gte && row.updatedAt < w.updatedAt.gte) return false;
    if (w.updatedAt.gt && !(row.updatedAt > w.updatedAt.gt)) return false;
  }
  if (w.id && !(row.id > w.id.gt)) return false;
  if (w.OR && !w.OR.some((o) => matches(row, o))) return false;
  return true;
};
type OrderBy = { updatedAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[];
/** Applique VRAIMENT le tri demandé par le service (sens compris), comme PostgreSQL. */
const compare = (orderBy: OrderBy) => (a: Row, b: Row) => {
  for (const key of orderBy) {
    const [field, dir] = Object.entries(key)[0] as ['updatedAt' | 'id', 'asc' | 'desc'];
    const x = field === 'updatedAt' ? a.updatedAt.getTime() : a.id;
    const y = field === 'updatedAt' ? b.updatedAt.getTime() : b.id;
    if (x !== y) return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1);
  }
  return 0;
};
const findMany =
  (rows: () => Row[]) =>
  async ({ where, orderBy, take }: { where: Where; orderBy: OrderBy; take: number }) =>
    rows()
      .filter((r) => matches(r, where))
      .sort(compare(orderBy))
      .slice(0, take)
      .map((r) => ({ ...r }));

const fakePrisma = {
  measurement: { findMany: findMany(() => measurements) },
  lifeEvent: { findMany: findMany(() => events) },
};
const fakeConfig = {
  get: () => undefined,
  getOrThrow: (key: string) => {
    if (key === 'FIELD_ENCRYPTION_KEY') return FIELD_KEY;
    throw new Error(`Configuration absente du test : ${key}`);
  },
};
class FakeInfraModule {}

const awa = randomUUID();
const paul = randomUUID();

/** Mesure en base, modifiée à T0 + `ms`. */
const measurement = (ms: number, over: Partial<Row> = {}): Row => ({
  id: randomUUID(),
  patientId: awa,
  valueMgDl: 110,
  originalValue: 1.1,
  originalUnit: 'G_L',
  measuredAt: new Date(T0 - 3_600_000),
  context: 'FASTING',
  source: 'MANUAL',
  importBatchId: null,
  noteEncrypted: null,
  updatedAt: new Date(T0 + ms),
  deletedAt: null,
  ...over,
});
/** Mesure modifiée à l'instant absolu `at` (ms). */
const measurementAt = (at: number, over: Partial<Row> = {}): Row => measurement(at - T0, over);
const event = (ms: number, over: Partial<Row> = {}): Row => ({
  id: randomUUID(),
  patientId: awa,
  type: 'MEAL',
  occurredAt: new Date(T0 - 3_600_000),
  label: 'Déjeuner',
  detailsEncrypted: null,
  durationMinutes: null,
  updatedAt: new Date(T0 + ms),
  deletedAt: null,
  ...over,
});

describe('L8-05 : GET /sync/pull', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  type Page = {
    measurements: { id: string; note: string | null; deletedAt: string | null }[];
    events: { id: string; details: string | null; deletedAt: string | null }[];
    nextCursor: string | null;
    hasMore: boolean;
    serverTime: string;
  };
  const pull = async (query: Record<string, string> = {}, who: string | null = token(awa)) => {
    const res = await fetch(`${baseUrl}/sync/pull?${new URLSearchParams(query)}`, {
      headers: who ? { authorization: `Bearer ${who}` } : {},
    });
    return { status: res.status, body: (await res.json()) as Page & Record<string, unknown> };
  };
  /** Lit tout le flux page par page, comme le fera le téléphone ; renvoie les identifiants dans l'ordre. */
  const pullAll = async (limit: number, cursor?: string) => {
    const seen: string[] = [];
    let next = cursor;
    for (let i = 0; i < 1000; i++) {
      const { status, body } = await pull({
        limit: String(limit),
        ...(next ? { cursor: next } : {}),
      });
      expect(status).toBe(200);
      seen.push(...body.measurements.map((m) => m.id), ...body.events.map((e) => e.id));
      next = body.nextCursor ?? undefined;
      if (!body.hasMore) return { seen, cursor: next, pages: i + 1 };
    }
    throw new Error('pagination sans fin');
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [
            { provide: PrismaService, useValue: fakePrisma },
            { provide: ConfigService, useValue: fakeConfig },
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
    await app.close();
  });

  beforeEach(() => {
    measurements = [];
    events = [];
  });

  it('première synchronisation sur un compte vide : rien, pas de curseur, réponse au format partagé', async () => {
    const { status, body } = await pull();
    expect(status).toBe(200);
    expect(syncPullResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ measurements: [], events: [], nextCursor: null, hasMore: false });
    expect(body.serverTime).toMatch(/Z$/);
  });

  it('pull paginé : mesures et événements mêlés, aucun élément perdu ni répété (test obligatoire)', async () => {
    measurements = [measurement(1), measurement(3), measurement(5), measurement(7)];
    events = [event(2), event(4), event(6)];
    const expected = [...measurements, ...events]
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((r) => r.id);
    for (const limit of [1, 2, 3, 7, 500]) {
      const { seen, pages } = await pullAll(limit);
      expect(seen.sort()).toEqual([...expected].sort());
      expect(new Set(seen).size).toBe(7); // rien de répété
      expect(pages).toBe(Math.max(1, Math.ceil(7 / limit)));
    }
  });

  it('page : ordre croissant (updatedAt, id), hasMore, curseur exact pendant la lecture', async () => {
    measurements = [measurement(3), measurement(1)];
    events = [event(2)];
    const first = await pull({ limit: '2' });
    expect(first.body.hasMore).toBe(true);
    expect(first.body.measurements.map((m) => m.id)).toEqual([measurements[1]?.id]);
    expect(first.body.events.map((e) => e.id)).toEqual([events[0]?.id]);
    // Curseur = dernière ligne rendue, exactement (pas de recul pendant la lecture).
    expect(decodeSyncCursor(first.body.nextCursor as string)).toEqual({
      at: new Date(T0 + 2),
      id: events[0]?.id,
    });
  });

  it('500 lignes à la MÊME milliseconde (un import) : lues une seule fois, sans boucle', async () => {
    measurements = Array.from({ length: 500 }, () => measurement(10));
    events = Array.from({ length: 30 }, () => event(10));
    const { seen, pages } = await pullAll(200);
    expect(seen).toHaveLength(530);
    expect(new Set(seen).size).toBe(530);
    expect(pages).toBe(3);
  });

  it('fin de lecture, lignes ANCIENNES : curseur exact, rien n’est relu ensuite', async () => {
    measurements = [measurement(1_000), measurement(20_000)];
    const done = await pullAll(10);
    expect(decodeSyncCursor(done.cursor as string)).toEqual({
      at: new Date(T0 + 20_000),
      id: measurements[1]?.id,
    });
    const again = await pull({ cursor: done.cursor as string });
    expect(again.body).toMatchObject({ measurements: [], hasMore: false, nextCursor: done.cursor });
  });

  it('fin de lecture, ligne RÉCENTE : le curseur recule de 5 s ; la synchro suivante relit la marge, sans boucler', async () => {
    const base = recent();
    measurements = [measurementAt(base - 60_000), measurementAt(base + 29_000)];
    const done = await pullAll(10);
    expect(decodeSyncCursor(done.cursor as string)).toEqual({
      at: new Date(base + 29_000 - PULL_OVERLAP_MS),
      id: null,
    });
    // Synchro suivante : seule la dernière mesure (dans la marge) est relue, et le curseur reste stable.
    const again = await pull({ cursor: done.cursor as string });
    expect(again.body.measurements.map((m) => m.id)).toEqual([measurements[1]?.id]);
    expect(again.body.hasMore).toBe(false);
    expect(again.body.nextCursor).toBe(done.cursor);
  });

  it('marge : une ligne pile à 5 s avant la dernière est relue (≥, pas >)', async () => {
    const base = recent();
    measurements = [measurementAt(base + 24_000), measurementAt(base + 29_000)];
    const done = await pullAll(10);
    const again = await pull({ cursor: done.cursor as string });
    expect(again.body.measurements.map((m) => m.id)).toEqual(measurements.map((m) => m.id));
  });

  it('écriture lente (date plus ancienne, validée après la lecture) : rattrapée grâce à la marge', async () => {
    const base = recent();
    measurements = [measurementAt(base + 29_000)];
    const done = await pullAll(10);
    // Une transaction lente valide maintenant une ligne datée de 3 s AVANT la dernière lue.
    const late = measurementAt(base + 26_000);
    measurements.push(late);
    const next = await pullAll(10, done.cursor);
    expect(next.seen).toContain(late.id);
  });

  it('rien de nouveau : le curseur reçu est rendu tel quel (il ne recule pas à chaque appel)', async () => {
    const cursor = encodeSyncCursor({ at: new Date(T0 + 50_000), id: null });
    const { body } = await pull({ cursor });
    expect(body).toMatchObject({
      measurements: [],
      events: [],
      hasMore: false,
      nextCursor: cursor,
    });
  });

  it('modifiée après le curseur : renvoyée de nouveau ; suppressions comprises (tombstones)', async () => {
    const m = measurement(1);
    measurements = [m];
    const done = await pullAll(10);
    // Plus tard : la mesure est supprimée sur le serveur (annulation d'un import, autre appareil…).
    Object.assign(m, { updatedAt: new Date(T0 + 60_000), deletedAt: new Date(T0 + 60_000) });
    const { body } = await pull({ cursor: done.cursor as string });
    expect(body.measurements).toEqual([
      expect.objectContaining({
        id: m.id,
        deletedAt: new Date(T0 + 60_000).toISOString(),
        note: null,
      }),
    ]);
  });

  it('note et texte libre rendus en clair au patient (déchiffrés)', async () => {
    measurements = [measurement(1, { noteEncrypted: encryptField('Avant le sport', FIELD_KEY) })];
    events = [event(2, { detailsEncrypted: encryptField('500 mg', FIELD_KEY) })];
    const { body } = await pull();
    expect(body.measurements[0]?.note).toBe('Avant le sport');
    expect(body.events[0]?.details).toBe('500 mg');
  });

  it('seulement MES données : celles d’un autre patient ne sont jamais rendues', async () => {
    measurements = [measurement(1), measurement(2, { patientId: paul })];
    events = [event(3, { patientId: paul })];
    const { seen } = await pullAll(10);
    expect(seen).toEqual([measurements[0]?.id]);
  });

  it('paramètres invalides ⇒ 400 ; jeton absent ⇒ 401 ; médecin ⇒ 403', async () => {
    for (const cursor of ['abc', encodeSyncCursor({ at: new Date(T0), id: null }).slice(0, 5)]) {
      const bad = await pull({ cursor });
      expect(bad.status).toBe(400);
      expect(bad.body.issues).toEqual([expect.objectContaining({ path: 'cursor' })]);
    }
    const forged = Buffer.from(JSON.stringify(['2026-10-13T08:00:00Z', "'; drop table"])).toString(
      'base64url',
    );
    expect((await pull({ cursor: forged })).status).toBe(400);
    for (const limit of ['0', '501', 'abc']) expect((await pull({ limit })).status).toBe(400);
    expect((await pull({}, null)).status).toBe(401);
    expect((await pull({}, token(awa, 'DOCTOR'))).status).toBe(403);
  });

  it('limite par défaut : 200 par page', async () => {
    measurements = Array.from({ length: 201 }, (_, i) => measurement(i));
    const { body } = await pull();
    expect(body.measurements).toHaveLength(200);
    expect(body.hasMore).toBe(true);
  });
});

describe('curseur de synchronisation', () => {
  it('aller-retour exact ; position « marge » (id null) ; illisible ⇒ 400', () => {
    const id = randomUUID();
    const at = new Date(T0 + 123);
    expect(decodeSyncCursor(encodeSyncCursor({ at, id }))).toEqual({ at, id });
    expect(decodeSyncCursor(encodeSyncCursor({ at, id: null }))).toEqual({ at, id: null });
    for (const bad of [
      'x',
      Buffer.from('[1,2]').toString('base64url'),
      Buffer.from(JSON.stringify(['pas une date', null])).toString('base64url'),
      Buffer.from(JSON.stringify([at.toISOString(), 42])).toString('base64url'),
      Buffer.from(JSON.stringify([at.getTime(), null])).toString('base64url'),
      // Un nombre n'est pas une date ISO, même si `new Date('2026')` l'accepterait.
      Buffer.from(JSON.stringify([2026, null])).toString('base64url'),
    ]) {
      expect(() => decodeSyncCursor(bad)).toThrow();
    }
  });
});
