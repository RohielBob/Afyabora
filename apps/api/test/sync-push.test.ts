// Tests du ticket L8-04 : POST /sync/push (synchronisation hors-ligne, envoi). Vrai serveur HTTP (port 0),
// vraies gardes JWT et rôles, vrais services des mesures et des événements ; base SIMULÉE en mémoire qui
// applique réellement les conditions d'écriture (patient, supprimé, clientUpdatedAt ≤) et l'unicité des
// identifiants (P2002).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { syncOpSchema, syncPushResponseSchema } from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UNUSUAL_VALUE_MESSAGE } from '../src/modules/measurements/measurements.service';
import { SyncModule } from '../src/modules/sync/sync.module';
import {
  CLOCK_AHEAD_REASON,
  ID_TAKEN_REASON,
  OP_ID_TAKEN_REASON,
  SyncService,
  invalidReason,
} from '../src/modules/sync/sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const FIELD_KEY = randomBytes(32).toString('base64');
const MINUTE = 60_000;

// ---------- Fausse base ----------
type Row = Record<string, unknown> & {
  id: string;
  patientId: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};
let measurements: Row[] = [];
let events: Row[] = [];
let opLog: { opId: string; patientId: string; deviceId: string; result: string }[] = [];
let users = new Set<string>();
let profiles = new Set<string>();
/** Profil supprimé entre la vérification et l'écriture (compte effacé pendant l'envoi). */
let profileGoneOnWrite = false;
/** S'exécute avant chaque écriture du journal (reproduit deux envois simultanés). */
let beforeLog: (() => Promise<void>) | null = null;

type Where = {
  id?: string;
  patientId?: string;
  deletedAt?: null;
  clientUpdatedAt?: { lte: Date };
};
const matches = (row: Row, w: Where) =>
  (w.id === undefined || row.id === w.id) &&
  (w.patientId === undefined || row.patientId === w.patientId) &&
  (!('deletedAt' in w) || row.deletedAt === null) &&
  (!w.clientUpdatedAt || row.clientUpdatedAt <= w.clientUpdatedAt.lte);

const table = (rows: () => Row[], defaults: Record<string, unknown>) => ({
  findUnique: async ({ where }: { where: { id: string } }) => {
    const row = rows().find((r) => r.id === where.id);
    return row ? { ...row } : null;
  },
  create: async ({ data }: { data: Row }) => {
    if (rows().some((r) => r.id === data.id)) throw { code: 'P2002' };
    if (!profiles.has(data.patientId) || profileGoneOnWrite) throw { code: 'P2003' };
    const row = { ...defaults, ...data, deletedAt: data.deletedAt ?? null, updatedAt: new Date() };
    rows().push(row);
    return { ...row };
  },
  updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const targets = rows().filter((r) => matches(r, where));
    targets.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
    return { count: targets.length };
  },
});

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users.has(where.id) ? { id: where.id } : null,
  },
  patientProfile: {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      profiles.has(where.userId) ? { userId: where.userId } : null,
  },
  measurement: table(() => measurements, { source: 'MANUAL', importBatchId: null, editedAt: null }),
  lifeEvent: table(() => events, {}),
  syncOpLog: {
    findUnique: async ({ where }: { where: { opId: string } }) => {
      const entry = opLog.find((e) => e.opId === where.opId);
      return entry ? { ...entry } : null;
    },
    create: async ({ data }: { data: (typeof opLog)[number] }) => {
      const pause = beforeLog;
      if (pause) {
        beforeLog = null;
        await pause();
      }
      if (opLog.some((e) => e.opId === data.opId)) throw { code: 'P2002' };
      opLog.push({ ...data });
      return data;
    },
  },
};
const fakeConfig = {
  get: () => undefined,
  getOrThrow: (key: string) => {
    if (key === 'FIELD_ENCRYPTION_KEY') return FIELD_KEY;
    throw new Error(`Configuration absente du test : ${key}`);
  },
};
class FakeInfraModule {}

// ---------- Opérations ----------
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const measure = (id: string = randomUUID(), over: Record<string, unknown> = {}) => ({
  id,
  value: 1.48,
  unit: 'G_L',
  measuredAt: iso(-60 * MINUTE),
  context: 'FASTING',
  note: 'Avant le petit-déjeuner',
  ...over,
});
const upsert = (payload: Record<string, unknown>, at = iso(-MINUTE), opId = randomUUID()) => ({
  opId,
  entity: 'measurement',
  type: 'upsert',
  entityId: payload.id,
  clientUpdatedAt: at,
  payload,
});
const remove = (entityId: string, at = iso(-MINUTE), entity = 'measurement') => ({
  opId: randomUUID(),
  entity,
  type: 'delete',
  entityId,
  clientUpdatedAt: at,
});
const eventPayload = (id: string = randomUUID(), over: Record<string, unknown> = {}) => ({
  id,
  type: 'TREATMENT',
  occurredAt: iso(-30 * MINUTE),
  label: 'Metformine',
  details: '500 mg, matin',
  ...over,
});

describe('raison d’une opération mal formée (en français, sans la valeur reçue)', () => {
  const reason = (raw: unknown) => {
    const parsed = syncOpSchema.safeParse(raw);
    if (parsed.success) throw new Error('opération valide');
    return invalidReason(parsed.error);
  };
  const base = {
    opId: randomUUID(),
    entity: 'measurement',
    type: 'delete',
    entityId: randomUUID(),
    clientUpdatedAt: new Date().toISOString(),
  };

  it.each([
    [{ ...base, opId: 'abc' }, 'opId : format invalide'],
    [{ ...base, entity: 'repas' }, 'entity : valeur non reconnue'],
    [
      { ...base, clientUpdatedAt: undefined },
      'clientUpdatedAt : champ manquant ou de mauvais type',
    ],
    [
      { ...base, type: 'upsert', payload: { id: 'x' } },
      'payload : contenu invalide pour cette entité',
    ],
    // Message écrit par notre schéma : gardé tel quel.
    [
      {
        ...base,
        payload: { id: base.entityId, value: 1.1, unit: 'G_L', measuredAt: base.clientUpdatedAt },
      },
      'payload : Une suppression ne contient pas de payload',
    ],
  ])('%#', (raw, expected) => {
    expect(reason(raw)).toBe(expected);
  });

  it('la valeur reçue n’apparaît jamais dans la raison', () => {
    expect(reason({ ...base, opId: 'glycemie-187' })).not.toContain('187');
  });
});

describe('L8-04 : POST /sync/push', () => {
  let app: INestApplication;
  let service: SyncService;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const device = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const push = async (
    ops: unknown[],
    who: string | null = token(awa),
    deviceId: unknown = device,
  ) => {
    const res = await fetch(`${baseUrl}/sync/push`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      body: JSON.stringify({ deviceId, ops }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const results = async (ops: unknown[], who = token(awa)) => {
    const { status, body } = await push(ops, who);
    expect(status).toBe(200);
    return (body.results as { opId: string; result: string; reason?: string }[]).map((r) => [
      r.result,
      r.reason,
    ]);
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
    service = moduleRef.get(SyncService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    measurements = [];
    events = [];
    opLog = [];
    users = new Set([awa, paul]);
    profiles = new Set([awa, paul]);
    beforeLog = null;
    profileGoneOnWrite = false;
  });

  // ------------------------------------------------------------------ tests obligatoires (README)
  describe('tests obligatoires du module', () => {
    it('même lot envoyé deux fois : aucun doublon, la 2e fois tout est DUPLICATE', async () => {
      const id = randomUUID();
      const ops = [upsert(measure(id)), upsert(eventPayload() as never, iso(-MINUTE))].map(
        (op, i) => (i === 1 ? { ...op, entity: 'event' } : op),
      );
      expect(await results(ops)).toEqual([
        ['APPLIED', undefined],
        ['APPLIED', undefined],
      ]);
      expect(await results(ops)).toEqual([
        ['DUPLICATE', undefined],
        ['DUPLICATE', undefined],
      ]);
      expect(measurements).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(opLog).toHaveLength(2);
    });

    it('suppression hors-ligne propagée : tombstone, note effacée', async () => {
      const id = randomUUID();
      await results([upsert(measure(id), iso(-10 * MINUTE))]);
      expect(await results([remove(id, iso(-MINUTE))])).toEqual([['APPLIED', undefined]]);
      expect(measurements[0]).toMatchObject({ deletedAt: expect.any(Date), noteEncrypted: null });
    });

    it('conflit : la dernière écriture gagne (clientUpdatedAt)', async () => {
      const id = randomUUID();
      await results([upsert(measure(id, { value: 1.2 }), iso(-10 * MINUTE))]);
      // Plus ancienne que la version du serveur : refusée, rien ne change.
      expect(await results([upsert(measure(id, { value: 1.9 }), iso(-20 * MINUTE))])).toEqual([
        ['CONFLICT_SERVER_WINS', undefined],
      ]);
      expect(measurements[0]?.valueMgDl).toBe(120);
      // Plus récente : appliquée.
      expect(await results([upsert(measure(id, { value: 1.5 }), iso(-5 * MINUTE))])).toEqual([
        ['APPLIED', undefined],
      ]);
      expect(measurements[0]).toMatchObject({ valueMgDl: 150, editedAt: expect.any(Date) });
      // Même instant (rejeu d'une opération identique sous un autre opId) : appliquée, sans dégât.
      expect(
        await results([
          upsert(
            measure(id, { value: 1.5 }),
            (measurements[0] as Row).clientUpdatedAt.toISOString(),
          ),
        ]),
      ).toEqual([['APPLIED', undefined]]);
    });

    it('une opération invalide n’empêche pas les autres (REJECTED + raison)', async () => {
      const ops = [
        upsert(measure()),
        { ...upsert(measure()), payload: { id: 'pas-un-uuid' } },
        upsert(measure()),
      ];
      const got = await results(ops);
      expect(got.map(([r]) => r)).toEqual(['APPLIED', 'REJECTED', 'APPLIED']);
      expect(got[1]?.[1]).toBe('payload : contenu invalide pour cette entité');
      expect(measurements).toHaveLength(2);
      expect(opLog).toHaveLength(2); // une opération rejetée n'est pas notée
    });
  });

  // ------------------------------------------------------------------ enveloppe et accès
  describe('enveloppe et accès', () => {
    it('plus de 200 opérations ou deviceId invalide ⇒ 400 pour le lot ; lot vide ⇒ aucun résultat', async () => {
      const big = await push(Array.from({ length: 201 }, () => upsert(measure())));
      expect(big.status).toBe(400);
      expect(big.body.issues).toEqual([expect.objectContaining({ path: 'ops' })]);
      const badDevice = await push([], token(awa), 'telephone-1');
      expect(badDevice.status).toBe(400);
      expect(badDevice.body.issues).toEqual([expect.objectContaining({ path: 'deviceId' })]);
      const empty = await push([]);
      expect(empty.status).toBe(200);
      expect(empty.body.results).toEqual([]);
      expect(measurements).toEqual([]);
    });

    it('200 opérations pile : toutes traitées ; la réponse suit le schéma partagé, heure en UTC', async () => {
      const { status, body } = await push(Array.from({ length: 200 }, () => upsert(measure())));
      expect(status).toBe(200);
      expect(syncPushResponseSchema.safeParse(body).success).toBe(true);
      expect(body.serverTime).toMatch(/Z$/);
      expect(measurements).toHaveLength(200);
    });

    it('jeton absent ⇒ 401 ; médecin ⇒ 403 ; sans profil ⇒ 400 ; compte supprimé ⇒ 401', async () => {
      expect((await push([upsert(measure())], null)).status).toBe(401);
      expect((await push([upsert(measure())], token(awa, 'DOCTOR'))).status).toBe(403);
      profiles.delete(awa);
      const noProfile = await push([upsert(measure())]);
      expect(noProfile.status).toBe(400);
      expect(noProfile.body.message).toContain('profil médical');
      users.delete(awa);
      expect((await push([upsert(measure())])).status).toBe(401);
      expect(measurements).toEqual([]);
    });

    it('compte supprimé PENDANT l’envoi : 401 pour tout le lot (pas un « rejet »), rien de noté', async () => {
      profileGoneOnWrite = true;
      users.delete(awa);
      expect((await push([upsert(measure())])).status).toBe(401);
      expect(opLog).toEqual([]);
      // Profil absent seulement au moment d'écrire, compte encore là : refus clair pour la donnée.
      users.add(awa);
      const got = await push([upsert(measure())]);
      expect(got.status).toBe(200);
      expect((got.body.results as { result: string; reason: string }[])[0]).toMatchObject({
        result: 'REJECTED',
        reason: expect.stringContaining('profil médical'),
      });
    });

    it('donnée d’un autre patient : refus neutre, rien n’est modifié ni révélé', async () => {
      const id = randomUUID();
      await results([upsert(measure(id, { value: 1.2 }))], token(paul));
      expect(await results([upsert(measure(id, { value: 1.9 }))])).toEqual([
        ['REJECTED', ID_TAKEN_REASON],
      ]);
      expect(await results([remove(id)])).toEqual([['REJECTED', ID_TAKEN_REASON]]);
      expect(measurements[0]).toMatchObject({ patientId: paul, valueMgDl: 120, deletedAt: null });
    });

    it('opId déjà utilisé par un AUTRE patient : refusé, rien n’est appliqué', async () => {
      const op = upsert(measure());
      await results([op], token(paul));
      expect(await results([{ ...op, payload: measure(op.entityId as string) }])).toEqual([
        ['REJECTED', OP_ID_TAKEN_REASON],
      ]);
      expect(measurements).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ règles des données
  describe('règles des mesures et des événements (mêmes que POST / PUT)', () => {
    it('valeur inhabituelle non confirmée ⇒ REJECTED ; confirmée ⇒ APPLIED', async () => {
      const got = await results([
        upsert(measure(randomUUID(), { value: 18.7 })),
        upsert(measure(randomUUID(), { value: 18.7, confirmedUnusual: true })),
      ]);
      expect(got).toEqual([
        ['REJECTED', UNUSUAL_VALUE_MESSAGE],
        ['APPLIED', undefined],
      ]);
    });

    it('mesure datée dans le futur ⇒ REJECTED avec la raison du champ', async () => {
      expect(
        await results([upsert(measure(randomUUID(), { measuredAt: iso(10 * MINUTE) }))]),
      ).toEqual([['REJECTED', 'La date de la mesure est dans le futur.']]);
    });

    it('horloge de l’appareil en avance de plus de 5 minutes ⇒ REJECTED ; 4 minutes ⇒ acceptée', async () => {
      expect(await results([upsert(measure(), iso(6 * MINUTE))])).toEqual([
        ['REJECTED', CLOCK_AHEAD_REASON],
      ]);
      expect(await results([upsert(measure(), iso(4 * MINUTE))])).toEqual([['APPLIED', undefined]]);
    });

    it('note chiffrée en base, source MANUAL ; une mesure importée garde sa source', async () => {
      const id = randomUUID();
      await results([upsert(measure(id), iso(-10 * MINUTE))]);
      const row = measurements[0] as Row;
      expect(row.source).toBe('MANUAL');
      expect(row.noteEncrypted).not.toContain('petit-déjeuner');
      expect(decryptField(row.noteEncrypted as string, FIELD_KEY)).toBe('Avant le petit-déjeuner');
      row.source = 'IMPORT';
      await results([upsert(measure(id, { value: 1.3 }), iso(-MINUTE))]);
      expect(measurements[0]).toMatchObject({ source: 'IMPORT', valueMgDl: 130 });
    });

    it('supprimée sur le serveur : un upsert ne la ressuscite pas (CONFLICT_SERVER_WINS)', async () => {
      const id = randomUUID();
      await results([upsert(measure(id), iso(-10 * MINUTE)), remove(id, iso(-9 * MINUTE))]);
      expect(await results([upsert(measure(id), iso(-MINUTE))])).toEqual([
        ['CONFLICT_SERVER_WINS', undefined],
      ]);
      expect(measurements[0]?.deletedAt).toBeInstanceOf(Date);
    });

    it('supprimer : inconnue ou déjà supprimée ⇒ APPLIED ; modifiée APRÈS sur le serveur ⇒ le serveur gagne', async () => {
      expect(await results([remove(randomUUID())])).toEqual([['APPLIED', undefined]]);
      const id = randomUUID();
      await results([upsert(measure(id), iso(-5 * MINUTE))]);
      expect(await results([remove(id, iso(-10 * MINUTE))])).toEqual([
        ['CONFLICT_SERVER_WINS', undefined],
      ]);
      expect(measurements[0]?.deletedAt).toBeNull();
      await results([remove(id, iso(-MINUTE))]);
      expect(await results([remove(id, iso(-MINUTE))])).toEqual([['APPLIED', undefined]]);
    });

    it('événements : création, conflit, suppression ; texte libre chiffré puis effacé', async () => {
      const id = randomUUID();
      const op = (at: string, over: Record<string, unknown> = {}) => ({
        ...upsert(eventPayload(id, over) as never, at),
        entity: 'event',
      });
      expect(await results([op(iso(-10 * MINUTE))])).toEqual([['APPLIED', undefined]]);
      const row = events[0] as Row;
      expect(decryptField(row.detailsEncrypted as string, FIELD_KEY)).toBe('500 mg, matin');
      expect(await results([op(iso(-20 * MINUTE), { label: 'Ancien' })])).toEqual([
        ['CONFLICT_SERVER_WINS', undefined],
      ]);
      expect(await results([op(iso(-5 * MINUTE), { label: 'Metformine 850' })])).toEqual([
        ['APPLIED', undefined],
      ]);
      expect(events[0]?.label).toBe('Metformine 850');
      expect(await results([remove(id, iso(-MINUTE), 'event')])).toEqual([['APPLIED', undefined]]);
      expect(events[0]).toMatchObject({ deletedAt: expect.any(Date), detailsEncrypted: null });
      // Supprimé : un upsert plus récent ne le ressuscite pas.
      expect(await results([op(iso(-0.5 * MINUTE), { label: 'Après suppression' })])).toEqual([
        ['CONFLICT_SERVER_WINS', undefined],
      ]);
      expect(events[0]).toMatchObject({ label: 'Metformine 850', deletedAt: expect.any(Date) });
    });

    it('événement daté dans le futur ⇒ REJECTED ; d’un autre patient ⇒ refus neutre', async () => {
      const future = {
        ...upsert(eventPayload(randomUUID(), { occurredAt: iso(9 * MINUTE) }) as never),
        entity: 'event',
      };
      expect(await results([future])).toEqual([
        ['REJECTED', 'La date de l’événement est dans le futur.'],
      ]);
      const id = randomUUID();
      await results([{ ...upsert(eventPayload(id) as never), entity: 'event' }], token(paul));
      expect(await results([{ ...upsert(eventPayload(id) as never), entity: 'event' }])).toEqual([
        ['REJECTED', ID_TAKEN_REASON],
      ]);
      expect(await results([remove(id, iso(-MINUTE), 'event')])).toEqual([
        ['REJECTED', ID_TAKEN_REASON],
      ]);
    });
  });

  // ------------------------------------------------------------------ ordre, rejeu, simultanéité
  describe('ordre, rejeu et envois simultanés', () => {
    it('dans un lot : créer puis supprimer la même mesure ; même opId deux fois ⇒ DUPLICATE', async () => {
      const id = randomUUID();
      const create = upsert(measure(id), iso(-3 * MINUTE));
      expect(await results([create, remove(id, iso(-2 * MINUTE)), create])).toEqual([
        ['APPLIED', undefined],
        ['APPLIED', undefined],
        ['DUPLICATE', undefined],
      ]);
      expect(measurements[0]?.deletedAt).toBeInstanceOf(Date);
    });

    it('opération rejetée puis renvoyée plus tard : réexaminée (rien n’était noté)', async () => {
      const now = new Date();
      const op = upsert(
        measure(randomUUID(), { measuredAt: new Date(now.getTime() + 10 * MINUTE).toISOString() }),
        now.toISOString(),
      );
      const first = await service.push(awa, { deviceId: device, ops: [op] }, now);
      expect(first.results[0]).toMatchObject({ result: 'REJECTED' });
      const later = await service.push(
        awa,
        { deviceId: device, ops: [op] },
        new Date(now.getTime() + 20 * MINUTE),
      );
      expect(later.results[0]).toMatchObject({ result: 'APPLIED' });
      expect(measurements).toHaveLength(1);
    });

    it('le même lot envoyé deux fois EN MÊME TEMPS : une seule mesure, aucune erreur', async () => {
      const op = upsert(measure());
      let second: Promise<{ status: number; body: Record<string, unknown> }> | null = null;
      beforeLog = async () => {
        second = push([op]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      };
      const first = await push([op]);
      const other = await (second as unknown as Promise<{
        status: number;
        body: Record<string, unknown>;
      }>);
      expect([first.status, other.status]).toEqual([200, 200]);
      const codes = [first, other].map((r) => (r.body.results as { result: string }[])[0]?.result);
      expect(codes.every((c) => c === 'APPLIED' || c === 'DUPLICATE')).toBe(true);
      expect(measurements).toHaveLength(1);
      expect(opLog).toHaveLength(1);
    });

    it('opId illisible : REJECTED avec l’opId tel quel (ou vide), le lot continue', async () => {
      const got = await push([{ opId: 42, entity: 'measurement' }, upsert(measure())]);
      const list = got.body.results as { opId: string; result: string }[];
      expect(list.map((r) => [r.opId, r.result])).toEqual([
        ['', 'REJECTED'],
        [expect.any(String), 'APPLIED'],
      ]);
    });
  });
});
