// Ticket L8-06 : moteur de synchronisation. Le téléphone est simulé par la base en mémoire (la même que
// l'aperçu web, memory-store.ts) et le serveur par FakeServer (mêmes règles que l'API). Les écritures
// locales passent par les VRAIS plans (db/repositories/plans.ts), comme sur téléphone.
import type { CreateMeasurementInput } from '@glyka/shared';
import {
  planEventCreate,
  planMeasurementCreate,
  planMeasurementDelete,
  planMeasurementUpdate,
} from '@/db/repositories/plans';
import { createWebMemory, enqueueInMemory, type WebMemory } from '@/db/web-memory';
import { createSyncEngine, type SyncEngine, type SyncStore } from '../engine';
import { createMemorySyncStore } from '../memory-store';
import type { RejectedStore } from '../rejected';
import { KV_CURSOR } from '../sqlite-store';
import { FakeApiError, FakeServer } from './fake-server';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DEVICE = uuid(999);
let ids = 0;
const nextId = () => uuid(++ids);

let memory: WebMemory;
let server: FakeServer;
let store: SyncStore & RejectedStore;
let engine: SyncEngine;
let signedIn: boolean;
/** Horloge du téléphone (ms) : avance d'une minute à chaque écriture locale. */
let phoneClock: number;

const input = (id: string, value = 110, minute = 0): CreateMeasurementInput => ({
  id,
  value,
  unit: 'MG_DL',
  measuredAt: `2026-10-09T07:${String(minute).padStart(2, '0')}:00.000Z`,
  context: 'FASTING',
  confirmedUnusual: false,
});
const ctx = () => {
  phoneClock += 60_000;
  return { opId: nextId(), now: new Date(phoneClock).toISOString() };
};

/** Saisie sur le téléphone : la ligne ET son opération (comme la transaction SQLite). */
function localCreate(id: string, value = 110) {
  const plan = planMeasurementCreate(input(id, value), ctx());
  memory.measurements.set(id, plan.row);
  enqueueInMemory(memory, plan.op);
  return plan.op.opId;
}
function localUpdate(id: string, value: number) {
  const current = memory.measurements.get(id);
  if (!current) throw new Error('absente');
  const plan = planMeasurementUpdate(current, { value, unit: 'MG_DL' }, ctx());
  memory.measurements.set(id, plan.row);
  enqueueInMemory(memory, plan.op);
  return plan.op.opId;
}
function localDelete(id: string) {
  const current = memory.measurements.get(id);
  if (!current) throw new Error('absente');
  const plan = planMeasurementDelete(current, ctx());
  memory.measurements.set(id, plan.row);
  enqueueInMemory(memory, plan.op);
}

const start = (overrides: Partial<Parameters<typeof createSyncEngine>[0]> = {}) => {
  engine = createSyncEngine({
    store,
    api: server.api,
    canSync: async () => signedIn,
    now: () => new Date(phoneClock),
    ...overrides,
  });
};

beforeEach(() => {
  ids = 0;
  memory = createWebMemory();
  memory.kv.set('sync_device_id', DEVICE);
  server = new FakeServer();
  store = createMemorySyncStore(memory, nextId);
  signedIn = true;
  phoneClock = Date.parse('2026-10-10T07:00:00.000Z');
  start();
});

afterEach(async () => {
  await engine.stop(); // aucun nouvel essai programmé ne survit au test
  jest.useRealTimers();
});

describe('envoi (push)', () => {
  it('envoie la file, la vide, et les mesures ne sont plus « en attente »', async () => {
    localCreate(uuid(1));
    localCreate(uuid(2), 95);

    const state = await engine.runNow();

    expect(server.pushes).toHaveLength(1);
    expect(server.pushes[0]?.map((op) => op.entityId)).toEqual([uuid(1), uuid(2)]);
    expect(server.measurement(uuid(2))?.valueMgDl).toBe(95);
    expect(memory.outbox).toHaveLength(0);
    expect(memory.measurements.get(uuid(1))?.pending_sync).toBe(0);
    expect(state).toMatchObject({
      status: 'idle',
      pendingCount: 0,
      failedCount: 0,
      lastError: null,
    });
    expect(state.lastSuccessAt).toBe(new Date(phoneClock).toISOString());
  });

  it('coalescence : trois modifications de la même mesure ⇒ UNE opération, la dernière', async () => {
    localCreate(uuid(1), 100);
    localUpdate(uuid(1), 120);
    const last = localUpdate(uuid(1), 140);

    await engine.runNow();

    expect(server.pushes[0]?.map((op) => op.opId)).toEqual([last]);
    expect(server.measurement(uuid(1))?.valueMgDl).toBe(140);
    expect(memory.outbox).toHaveLength(0); // les opérations remplacées sont retirées aussi
  });

  it('création puis suppression hors-ligne : seule la suppression part, rien sur le serveur', async () => {
    localCreate(uuid(1));
    localDelete(uuid(1));

    await engine.runNow();

    expect(server.pushes[0]?.map((op) => op.type)).toEqual(['delete']);
    expect(server.rows.size).toBe(0);
    expect(memory.outbox).toHaveLength(0);
  });

  it('opération REFUSÉE : gardée avec sa raison, plus renvoyée, et elle ne bloque pas les autres', async () => {
    const refused = localCreate(uuid(1), 700);
    localCreate(uuid(2), 100);
    server.refuse.set(refused, 'Valeur inhabituelle : vérifiez la saisie.');

    const state = await engine.runNow();

    expect(server.measurement(uuid(2))).toBeDefined();
    expect(server.measurement(uuid(1))).toBeUndefined();
    expect(memory.outbox).toEqual([
      expect.objectContaining({
        op_id: refused,
        last_error: 'Valeur inhabituelle : vérifiez la saisie.',
        attempts: 1,
      }),
    ]);
    expect(memory.measurements.get(uuid(1))?.pending_sync).toBe(1);
    expect(state).toMatchObject({ status: 'idle', pendingCount: 0, failedCount: 1 });

    await engine.runNow();
    expect(server.pushes).toHaveLength(1); // jamais renvoyée automatiquement
  });

  it("une modification APRÈS un refus remplace l'opération refusée", async () => {
    const refused = localCreate(uuid(1), 700);
    server.refuse.set(refused, 'Valeur inhabituelle.');
    await engine.runNow();

    localUpdate(uuid(1), 140);
    const state = await engine.runNow();

    expect(server.measurement(uuid(1))?.valueMgDl).toBe(140);
    expect(memory.outbox).toHaveLength(0);
    expect(state.failedCount).toBe(0);
  });

  it('rejouer un envoi (réponse perdue) ne crée aucun doublon', async () => {
    const opId = localCreate(uuid(1));
    // Le serveur a appliqué l'opération, mais la réponse s'est perdue : elle est encore dans la file.
    await server.api.push({ deviceId: DEVICE, ops: [opOf(0)] });

    await engine.runNow();

    expect(server.pushes.map((ops) => ops[0]?.opId)).toEqual([opId, opId]); // renvoyée ⇒ DUPLICATE
    expect([...server.rows.keys()]).toEqual([uuid(1)]);
    expect(memory.outbox).toHaveLength(0);
    expect(memory.measurements.get(uuid(1))?.pending_sync).toBe(0);
  });

  it("une saisie PENDANT l'envoi reste en attente et part au cycle suivant", async () => {
    localCreate(uuid(1), 100);
    server.duringPush = async () => {
      localUpdate(uuid(1), 180);
    };

    await engine.runNow();

    // Le premier envoi portait 100 ; la saisie faite pendant l'envoi (180) est partie ensuite.
    expect(
      server.pushes.map((ops) => ops.map((op) => (op.payload as { value: number }).value)),
    ).toEqual([[100], [180]]);
    expect(server.measurement(uuid(1))?.valueMgDl).toBe(180);
    expect(memory.measurements.get(uuid(1))?.pending_sync).toBe(0);
  });

  it("réponse reçue alors qu'une autre modification attend : la mesure RESTE « en attente »", async () => {
    localCreate(uuid(1), 100);
    const [first] = await store.readOutbox(10);
    localUpdate(uuid(1), 180); // saisie faite pendant l'envoi de `first`

    await store.settle(
      [
        {
          opId: first!.op_id,
          seq: first!.seq,
          entity: 'measurement',
          entityId: uuid(1),
          outcome: 'done',
        },
      ],
      false,
    );

    expect(memory.outbox).toHaveLength(1);
    expect(memory.measurements.get(uuid(1))?.pending_sync).toBe(1);
  });

  it('sans session : aucun appel au serveur', async () => {
    signedIn = false;
    localCreate(uuid(1));

    const state = await engine.runNow();

    expect(server.pushes).toHaveLength(0);
    expect(server.pulls).toHaveLength(0);
    expect(state.status).toBe('idle');
    expect(memory.outbox).toHaveLength(1);
  });
});

/** Opération de la file à la position `index` (pour rejouer un envoi). */
function opOf(index: number) {
  const row = memory.outbox[index];
  if (!row) throw new Error('file vide');
  return {
    opId: row.op_id,
    entity: row.entity,
    type: row.type,
    entityId: row.entity_id,
    clientUpdatedAt: row.client_updated_at,
    payload: row.payload ? JSON.parse(row.payload) : undefined,
  };
}

describe('réception (pull)', () => {
  it("première synchronisation : tout le compte arrive, page par page, sans repasser par la file d'envoi", async () => {
    server.pageSize = 2;
    for (let i = 1; i <= 5; i++) server.writeMeasurement(input(uuid(100 + i), 100 + i, i));
    server.writeEvent({
      id: uuid(200),
      type: 'MEAL',
      occurredAt: '2026-10-09T12:00:00.000Z',
      label: 'Déjeuner',
    });
    const changed = jest.fn();
    engine.onDataChanged(changed);

    await engine.runNow();

    expect(server.pulls).toEqual([null, 'v2', 'v4']);
    expect(memory.measurements.size).toBe(5);
    expect(memory.events.get(uuid(200))?.label).toBe('Déjeuner');
    expect(memory.outbox).toHaveLength(0);
    expect(memory.kv.get(KV_CURSOR)).toBe('v6');
    expect(memory.measurements.get(uuid(101))).toMatchObject({ value_mgdl: 101, pending_sync: 0 });
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('synchronisation suivante : seulement ce qui a changé, suppressions comprises', async () => {
    server.writeMeasurement(input(uuid(1)));
    server.writeMeasurement(input(uuid(2)));
    await engine.runNow();

    server.remove(uuid(1)); // ex. annulation d'un import
    await engine.runNow();

    expect(server.pulls.at(-1)).toBe('v2');
    expect(memory.measurements.get(uuid(1))?.deleted_at).not.toBeNull();
    expect(memory.measurements.get(uuid(2))?.deleted_at).toBeNull();
  });

  it('rien de nouveau : la base locale ne change pas et la chronologie ne se recharge pas', async () => {
    server.writeMeasurement(input(uuid(1)));
    await engine.runNow();
    const changed = jest.fn();
    engine.onDataChanged(changed);

    await engine.runNow();

    expect(changed).not.toHaveBeenCalled();
  });

  it('modification locale EN ATTENTE : la version reçue ne l’écrase pas, puis la locale part au serveur', async () => {
    server.writeMeasurement(input(uuid(1), 100));
    await engine.runNow();
    localUpdate(uuid(1), 150);
    // Le serveur change aussi, mais AVANT la modification du téléphone (horloge plus ancienne).
    server.writeMeasurement(input(uuid(1), 90), new Date(phoneClock - 30_000).toISOString());

    // La réception passe avant l'envoi : on simule en appliquant la page directement.
    await store.applyPull({ measurements: [server.measurement(uuid(1))!], events: [] }, 'v2');
    expect(memory.measurements.get(uuid(1))?.value_mgdl).toBe(150);

    await engine.runNow();
    expect(server.measurement(uuid(1))?.valueMgDl).toBe(150);
    expect(memory.measurements.get(uuid(1))).toMatchObject({ value_mgdl: 150, pending_sync: 0 });
  });

  it('supprimée sur le serveur alors que modifiée sur le téléphone : la suppression gagne, rien ne part', async () => {
    server.writeMeasurement(input(uuid(1)));
    await engine.runNow();
    localUpdate(uuid(1), 150);
    server.remove(uuid(1));

    await store.applyPull({ measurements: [server.measurement(uuid(1))!], events: [] }, 'v2');

    expect(memory.measurements.get(uuid(1))?.deleted_at).not.toBeNull();
    expect(memory.outbox).toHaveLength(0);
  });

  it('CONFLIT : la version du serveur gagne et revient sur le téléphone, même déjà vue', async () => {
    server.writeMeasurement(input(uuid(1), 100));
    await engine.runNow();
    // Un autre appareil, à l'horloge très en avance, a modifié la mesure ; le téléphone l'a reçue…
    server.writeMeasurement(input(uuid(1), 222), '2026-10-10T09:00:00.000Z');
    await engine.runNow();
    // … puis l'a modifiée : son horloge est plus ancienne ⇒ CONFLICT_SERVER_WINS.
    localUpdate(uuid(1), 150);

    const state = await engine.runNow();

    expect(server.measurement(uuid(1))?.valueMgDl).toBe(222);
    // Curseur remis à zéro ⇒ tout relu ⇒ la version du serveur est revenue.
    expect(server.pulls.at(-1)).toBeNull();
    expect(memory.measurements.get(uuid(1))).toMatchObject({ value_mgdl: 222, pending_sync: 0 });
    expect(state.status).toBe('idle');
  });

  it('modifier une mesure reçue, sur un téléphone EN RETARD : la modification gagne quand même', async () => {
    // Mesure importée sur le serveur à 08:00:01 ; le téléphone, en retard, croit qu'il est 07:01.
    server.writeMeasurement(input(uuid(1), 100));
    await engine.runNow();
    localUpdate(uuid(1), 150);

    await engine.runNow();

    expect(server.measurement(uuid(1))?.valueMgDl).toBe(150);
    expect(memory.measurements.get(uuid(1))?.value_mgdl).toBe(150);
  });

  it('curseur refusé (400) : on repart du début, une seule fois', async () => {
    server.writeMeasurement(input(uuid(1)));
    await engine.runNow();
    server.writeMeasurement(input(uuid(2)));
    server.rejectCursorOnce = true;

    const state = await engine.runNow();

    expect(server.pulls.slice(-2)).toEqual(['v1', null]);
    expect(memory.measurements.size).toBe(2);
    expect(state.status).toBe('idle');
  });

  it('beaucoup de pages : lues en plusieurs cycles, jamais en boucle', async () => {
    server.pageSize = 1;
    for (let i = 1; i <= 60; i++) server.writeMeasurement(input(uuid(100 + i), 100, i % 60));

    await engine.runNow();

    expect(memory.measurements.size).toBe(60);
    expect(server.pulls.length).toBe(60);
  });
});

describe('échecs et nouvel essai', () => {
  it('réseau coupé : rien n’est perdu, nouvel essai à 2 s, puis 4 s, et succès au retour du réseau', async () => {
    jest.useFakeTimers();
    localCreate(uuid(1));
    server.offline = true;

    let state = await engine.runNow();
    expect(state).toMatchObject({ status: 'offline', lastError: 'offline', pendingCount: 1 });
    expect(state.nextRetryAt).toBe(new Date(phoneClock + 2_000).toISOString());
    expect(memory.outbox).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(engine.getState().nextRetryAt).toBe(new Date(phoneClock + 4_000).toISOString());

    server.offline = false;
    await jest.advanceTimersByTimeAsync(4_000);
    state = engine.getState();
    expect(state).toMatchObject({
      status: 'idle',
      lastError: null,
      pendingCount: 0,
      nextRetryAt: null,
    });
    expect(server.measurement(uuid(1))).toBeDefined();
  });

  it('serveur en panne (503) : erreur « server » et nouvel essai ; délai remis à 2 s après un succès', async () => {
    jest.useFakeTimers();
    server.failNext = [503, 503];
    let state = await engine.runNow();
    expect(state).toMatchObject({ status: 'error', lastError: 'server' });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(engine.getState().nextRetryAt).toBe(new Date(phoneClock + 4_000).toISOString());
    await jest.advanceTimersByTimeAsync(4_000);
    expect(engine.getState().status).toBe('idle');

    server.failNext = [500];
    state = await engine.runNow();
    expect(state.nextRetryAt).toBe(new Date(phoneClock + 2_000).toISOString());
  });

  it('hors-ligne CONNU (mode avion) : aucune requête, essai de secours dans 5 min seulement', async () => {
    jest.useFakeTimers();
    localCreate(uuid(1));
    let online = false;
    start({ isOnline: async () => online });

    const state = await engine.runNow();

    expect(server.pushes).toHaveLength(0);
    expect(server.pulls).toHaveLength(0);
    expect(state).toMatchObject({ status: 'offline', lastError: 'offline', pendingCount: 1 });
    expect(state.nextRetryAt).toBe(new Date(phoneClock + 300_000).toISOString());
    await jest.advanceTimersByTimeAsync(60_000);
    expect(server.pushes).toHaveLength(0); // pas d'essai toutes les 2 s

    // Retour du réseau (L8-07 : triggers.ts demande une synchronisation tout de suite).
    online = true;
    engine.request(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(server.measurement(uuid(1))).toBeDefined();
    expect(engine.getState()).toMatchObject({ status: 'idle', nextRetryAt: null });
  });

  it('détection du réseau en erreur : on essaie quand même', async () => {
    localCreate(uuid(1));
    start({ isOnline: () => Promise.reject(new Error('NetInfo')) });
    const state = await engine.runNow();
    expect(state.status).toBe('idle');
    expect(server.measurement(uuid(1))).toBeDefined();
  });

  it('session expirée (401) : on s’arrête, sans nouvel essai', async () => {
    jest.useFakeTimers();
    server.failNext = [401];
    const state = await engine.runNow();
    expect(state).toMatchObject({ status: 'error', lastError: 'session', nextRetryAt: null });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('réponse illisible ou incomplète : erreur « server », les opérations restent dans la file', async () => {
    jest.useFakeTimers();
    localCreate(uuid(1));
    start({
      api: {
        ...server.api,
        push: async () => ({ results: [], serverTime: '2026-10-10T08:00:00.000Z' }),
      },
    });
    let state = await engine.runNow();
    expect(state.lastError).toBe('server');
    expect(memory.outbox).toHaveLength(1);

    start({
      api: {
        ...server.api,
        push: async () => {
          throw new TypeError('schéma'); // réponse refusée par le schéma partagé (service.ts)
        },
      },
    });
    state = await engine.runNow();
    expect(state.lastError).toBe('server');
  });

  it('base locale en erreur : erreur « local » et nouvel essai', async () => {
    jest.useFakeTimers();
    start({
      store: {
        ...store,
        readOutbox: async () => {
          throw new Error('disque');
        },
      },
    });
    const state = await engine.runNow();
    expect(state).toMatchObject({ status: 'error', lastError: 'local' });
    expect(state.nextRetryAt).not.toBeNull();
  });

  it('le délai croît jusqu’à 5 minutes, jamais plus', async () => {
    jest.useFakeTimers();
    server.offline = true;
    await engine.runNow();
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = Date.parse(engine.getState().nextRetryAt as string) - phoneClock;
      delays.push(next);
      await jest.advanceTimersByTimeAsync(next);
    }
    expect(delays).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000,
    ]);
  });
});

describe('compteurs et modifications refusées (L8-10)', () => {
  it('une donnée compte UNE fois, mesures et événements séparés', async () => {
    localCreate(uuid(1));
    localUpdate(uuid(1), 140);
    localUpdate(uuid(1), 150); // 3 opérations, 1 mesure
    localCreate(uuid(2));
    const plan = planEventCreate(
      { id: uuid(3), type: 'MEAL', occurredAt: '2026-10-09T12:00:00.000Z', label: 'Déjeuner' },
      ctx(),
    );
    memory.events.set(uuid(3), plan.row);
    enqueueInMemory(memory, plan.op);

    await engine.refresh();

    expect(engine.getState()).toMatchObject({
      status: 'idle',
      pendingCount: 3,
      pendingMeasurements: 2,
      pendingEvents: 1,
      failedCount: 0,
    });
  });

  it('refresh : relit la dernière synchronisation réussie gardée dans la base, sans cycle', async () => {
    memory.kv.set('sync_last_success', '2026-10-17T08:00:00.000Z');
    await engine.refresh();
    expect(engine.getState().lastSuccessAt).toBe('2026-10-17T08:00:00.000Z');
    expect(server.pushes).toHaveLength(0);
    expect(server.pulls).toHaveLength(0);
  });

  it('refresh : base indisponible ⇒ l’état ne change pas', async () => {
    start({
      store: {
        ...store,
        counts: () => Promise.reject(new Error('base')),
      },
    });
    await engine.refresh();
    expect(engine.getState()).toMatchObject({ pendingCount: 0, lastSuccessAt: null });
  });

  it('refusée : comptée à part ; « Réessayer » la renvoie, « Abandonner » rétablit la version du compte', async () => {
    server.writeMeasurement(input(uuid(1), 100));
    await engine.runNow();
    const refused = localUpdate(uuid(1), 700);
    server.refuse.set(refused, 'Valeur inhabituelle : vérifiez la saisie.');
    let state = await engine.runNow();
    expect(state).toMatchObject({ failedCount: 1, pendingCount: 0 });

    const [change] = await store.listRejected();
    expect(change).toMatchObject({
      opId: refused,
      entity: 'measurement',
      entityId: uuid(1),
      reason: 'Valeur inhabituelle : vérifiez la saisie.',
      attempts: 1,
    });
    expect(change?.measurement?.value_mgdl).toBe(700);

    // « Réessayer » : renvoyée (et refusée à nouveau ici : 2 refus).
    await store.retryRejected(refused);
    state = await engine.runNow();
    expect(server.pushes.at(-1)?.map((op) => op.opId)).toEqual([refused]);
    expect((await store.listRejected())[0]?.attempts).toBe(2);

    // « Abandonner » : modification et donnée retirées, tout relu ⇒ la version du compte (100) revient.
    await store.discardRejected(refused);
    expect(memory.outbox).toHaveLength(0);
    expect(memory.measurements.has(uuid(1))).toBe(false);
    state = await engine.runNow();
    expect(server.pulls.at(-1)).toBeNull();
    expect(memory.measurements.get(uuid(1))?.value_mgdl).toBe(100);
    expect(state).toMatchObject({ failedCount: 0, pendingCount: 0 });
  });

  it('abandonner une CRÉATION refusée : la donnée disparaît du téléphone (elle n’a jamais existé sur le compte)', async () => {
    const refused = localCreate(uuid(9), 700);
    server.refuse.set(refused, 'Valeur inhabituelle.');
    await engine.runNow();
    await store.discardRejected(refused);
    await engine.runNow();
    expect(memory.measurements.has(uuid(9))).toBe(false);
    expect(await store.listRejected()).toEqual([]);
  });

  it('la liste des refus ignore les modifications normales en attente', async () => {
    const refused = localCreate(uuid(1), 700);
    server.refuse.set(refused, 'Valeur inhabituelle.');
    await engine.runNow();
    localCreate(uuid(2)); // en attente, pas refusée
    const list = await store.listRejected();
    expect(list.map((c) => c.opId)).toEqual([refused]);
  });

  it('refresh lancé juste avant une déconnexion : rien n’est affiché ensuite', async () => {
    let release: (value: { measurements: number; events: number; failed: number }) => void = () =>
      undefined;
    start({
      store: {
        ...store,
        counts: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    });
    const refreshing = engine.refresh();
    await engine.stop();
    release({ measurements: 5, events: 0, failed: 0 });
    await refreshing;
    expect(engine.getState().pendingCount).toBe(0);
  });

  it('notifyDataChanged prévient les écrans', () => {
    const changed = jest.fn();
    engine.onDataChanged(changed);
    engine.notifyDataChanged();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('déclencheurs, verrou et déconnexion', () => {
  it('un seul cycle à la fois ; une demande pendant un cycle en relance UN juste après', async () => {
    localCreate(uuid(1));
    let inFlight = 0;
    let maxInFlight = 0;
    const push = server.api.push;
    start({
      api: {
        ...server.api,
        push: async (body) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          if (server.pushes.length === 0) {
            // Pendant le premier envoi : une saisie, et deux demandes de synchronisation.
            localCreate(uuid(2));
            engine.request(0);
            engine.request(0);
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight--;
          return push(body);
        },
      },
    });

    await engine.runNow();

    expect(maxInFlight).toBe(1);
    expect(server.pushes.map((ops) => ops.length)).toEqual([1, 1]);
    expect(memory.outbox).toHaveLength(0);
  });

  it('file qui ne se vide jamais (base en panne silencieuse) : 5 cycles au plus, puis une pause', async () => {
    jest.useFakeTimers();
    localCreate(uuid(1));
    start({ store: { ...store, settle: async () => undefined } }); // rien n'est jamais retiré
    await engine.runNow();
    expect(server.pushes).toHaveLength(5 * 20); // 20 lots par cycle, 5 cycles enchaînés
    expect(jest.getTimerCount()).toBe(1); // la suite attend 2 s
  });

  it('une demande plus lointaine ne repousse jamais une demande plus proche (nouvel essai à 2 s)', async () => {
    jest.useFakeTimers();
    engine.request(1_000);
    engine.request(3_000); // ex. une saisie pendant l'attente d'un nouvel essai
    await jest.advanceTimersByTimeAsync(1_000);
    expect(server.pulls).toHaveLength(1);
  });

  it('après une saisie : demandes regroupées, un seul cycle 3 s plus tard', async () => {
    jest.useFakeTimers();
    localCreate(uuid(1));
    engine.request(3_000);
    localCreate(uuid(2));
    engine.request(3_000);

    await jest.advanceTimersByTimeAsync(2_999);
    expect(server.pushes).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(server.pushes).toHaveLength(1);
    expect(server.pushes[0]).toHaveLength(2);
  });

  it('déconnexion pendant un cycle : il n’écrit plus RIEN dans la base, et l’état est remis à zéro', async () => {
    server.writeMeasurement(input(uuid(1)));
    let release: () => void = () => undefined;
    const pull = server.api.pull;
    start({
      api: {
        ...server.api,
        pull: async (cursor, limit) => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return pull(cursor, limit);
        },
      },
    });

    const running = engine.runNow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await engine.stop();
    release();
    await running;

    expect(memory.measurements.size).toBe(0);
    expect(memory.kv.get(KV_CURSOR)).toBeUndefined();
    expect(engine.getState()).toMatchObject({ status: 'idle', lastSuccessAt: null });
  });

  it('après une déconnexion, une nouvelle demande lance bien un cycle (compte suivant)', async () => {
    let release: () => void = () => undefined;
    const pull = server.api.pull;
    let slow = true;
    start({
      api: {
        ...server.api,
        pull: async (cursor, limit) => {
          if (slow) {
            slow = false;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return pull(cursor, limit);
        },
      },
    });
    const old = engine.runNow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await engine.stop();

    server.writeMeasurement(input(uuid(5)));
    const next = engine.runNow(); // le cycle d'avant est encore en vol
    release();
    await old;
    const state = await next;

    expect(state.status).toBe('idle');
    expect(memory.measurements.has(uuid(5))).toBe(true);
  });

  it('erreur réseau : statut 0 ⇒ « offline » (FakeApiError comme lib/api-client)', async () => {
    jest.useFakeTimers();
    server.failNext = [0];
    const state = await engine.runNow();
    expect(state.lastError).toBe('offline');
    expect(new FakeApiError(0).status).toBe(0);
  });
});
