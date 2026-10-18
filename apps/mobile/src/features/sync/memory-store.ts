// Base du moteur de synchronisation pour l'APERÇU WEB (L8-06) : la base en mémoire (db/web-memory.ts), avec
// exactement les mêmes décisions que la version SQLite (rules.ts). Sert aussi de base de référence dans les
// tests du moteur (__tests__/engine.test.ts).
import type { WebMemory } from '@/db/web-memory';
import type { SyncStore } from './engine';
import type { RejectedStore } from './rejected';
import { planPull } from './rules';
import { KV_CURSOR, KV_DEVICE_ID, KV_LAST_SUCCESS } from './sqlite-store';

export function createMemorySyncStore(
  memory: WebMemory,
  newId: () => string,
): SyncStore & RejectedStore {
  const setKv = (key: string, value: string | null) => {
    if (value === null) memory.kv.delete(key);
    else memory.kv.set(key, value);
  };
  const removeOps = (keep: (op: WebMemory['outbox'][number]) => boolean) => {
    const kept = memory.outbox.filter(keep);
    memory.outbox.length = 0;
    memory.outbox.push(...kept);
  };

  return {
    async deviceId() {
      const found = memory.kv.get(KV_DEVICE_ID);
      if (found) return found;
      const id = newId();
      memory.kv.set(KV_DEVICE_ID, id);
      return id;
    },

    async readOutbox(limit) {
      return memory.outbox
        .filter((op) => op.last_error === null)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit)
        .map((op) => ({ ...op }));
    },

    async settle(settlements, resetCursor) {
      for (const s of settlements) {
        removeOps(
          (op) => !(op.entity === s.entity && op.entity_id === s.entityId && op.seq < s.seq),
        );
        if (s.outcome === 'rejected') {
          const op = memory.outbox.find((o) => o.op_id === s.opId);
          if (op) {
            op.attempts += 1;
            op.last_error = s.reason ?? 'Opération refusée.';
          }
          continue;
        }
        removeOps((op) => op.op_id !== s.opId);
        const stillQueued = memory.outbox.some(
          (op) => op.entity === s.entity && op.entity_id === s.entityId,
        );
        if (stillQueued) continue;
        if (s.entity === 'measurement') {
          const row = memory.measurements.get(s.entityId);
          if (row) memory.measurements.set(s.entityId, { ...row, pending_sync: 0 });
        } else {
          const row = memory.events.get(s.entityId);
          if (row) memory.events.set(s.entityId, { ...row, pending_sync: 0 });
        }
      }
      if (resetCursor) setKv(KV_CURSOR, null);
    },

    async readCursor() {
      return memory.kv.get(KV_CURSOR) ?? null;
    },

    async resetCursor() {
      setKv(KV_CURSOR, null);
    },

    async applyPull(page, nextCursor) {
      const pending = new Set(
        memory.outbox
          .filter((op) => op.last_error === null)
          .map((op) => `${op.entity}:${op.entity_id}`),
      );
      const plan = planPull(page, {
        measurements: memory.measurements,
        events: memory.events,
        pending,
      });
      for (const row of plan.measurements) memory.measurements.set(row.id, row);
      for (const row of plan.events) memory.events.set(row.id, row);
      for (const drop of plan.dropPending) {
        removeOps((op) => !(op.entity === drop.entity && op.entity_id === drop.id));
      }
      setKv(KV_CURSOR, nextCursor);
      return plan.measurements.length + plan.events.length;
    },

    async counts() {
      // Une DONNÉE compte une fois, même avec plusieurs opérations.
      const distinct = (keep: (op: WebMemory['outbox'][number]) => boolean) =>
        new Set(memory.outbox.filter(keep).map((op) => `${op.entity}:${op.entity_id}`)).size;
      return {
        measurements: distinct((op) => op.last_error === null && op.entity === 'measurement'),
        events: distinct((op) => op.last_error === null && op.entity === 'event'),
        failed: distinct((op) => op.last_error !== null),
      };
    },

    async listRejected() {
      return memory.outbox
        .filter((op) => op.last_error !== null)
        .sort((a, b) => a.seq - b.seq)
        .map((op) => ({
          opId: op.op_id,
          entity: op.entity,
          entityId: op.entity_id,
          type: op.type,
          reason: op.last_error as string,
          attempts: op.attempts,
          measurement:
            op.entity === 'measurement' ? (memory.measurements.get(op.entity_id) ?? null) : null,
          event: op.entity === 'event' ? (memory.events.get(op.entity_id) ?? null) : null,
        }));
    },

    async retryRejected(opId) {
      const op = memory.outbox.find((o) => o.op_id === opId);
      if (op) op.last_error = null;
    },

    async discardRejected(opId) {
      const op = memory.outbox.find((o) => o.op_id === opId);
      if (!op) return;
      removeOps((o) => !(o.entity === op.entity && o.entity_id === op.entity_id));
      if (op.entity === 'measurement') memory.measurements.delete(op.entity_id);
      else memory.events.delete(op.entity_id);
      setKv(KV_CURSOR, null); // tout relire : la version du compte revient
    },

    async readLastSuccess() {
      return memory.kv.get(KV_LAST_SUCCESS) ?? null;
    },

    async writeLastSuccess(iso) {
      memory.kv.set(KV_LAST_SUCCESS, iso);
    },
  };
}
