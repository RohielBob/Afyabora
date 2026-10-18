// Base locale du moteur de synchronisation sur TÉLÉPHONE (L8-06) : tables SQLite `outbox`, `measurements`,
// `events` et `kv` (db/schema.ts, aucune migration nouvelle). Les décisions viennent de rules.ts ; ici,
// seulement le SQL. Chaque étape qui écrit plusieurs lignes le fait dans UNE transaction : une coupure
// (application fermée, batterie vide) laisse la base comme avant l'étape, jamais à moitié.
// Vérifié sur un vrai moteur SQLite (voir le README de la feature) ; les écrans ne l'appellent jamais.
import type { LifeEventDto, MeasurementDto } from '@glyka/shared';
import type { OutboxRow } from '@/db/repositories/outbox.repo';
import type { EventRow, MeasurementRow } from '@/db/repositories/plans';
import { saveRow, type LocalDb } from '@/db/repositories/write';
import type { SyncStore } from './engine';
import type { RejectedChange, RejectedStore } from './rejected';
import { planPull, type Settlement, type SyncEntity } from './rules';

/** Clés de la table `kv` (vidée à la déconnexion avec le reste, db/reset.ts). */
export const KV_DEVICE_ID = 'sync_device_id';
export const KV_CURSOR = 'sync_cursor';
export const KV_LAST_SUCCESS = 'sync_last_success';

const TABLE: Record<SyncEntity, 'measurements' | 'events'> = {
  measurement: 'measurements',
  event: 'events',
};

const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

async function readKv(db: LocalDb, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

async function writeKv(db: LocalDb, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM kv WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function createSqliteSyncStore(
  open: () => Promise<LocalDb>,
  newId: () => string,
): SyncStore & RejectedStore {
  return {
    async deviceId() {
      const db = await open();
      const found = await readKv(db, KV_DEVICE_ID);
      if (found) return found;
      const id = newId();
      await db.withTransactionAsync(() => writeKv(db, KV_DEVICE_ID, id));
      return id;
    },

    async readOutbox(limit) {
      const db = await open();
      return db.getAllAsync<OutboxRow>(
        'SELECT * FROM outbox WHERE last_error IS NULL ORDER BY seq ASC LIMIT ?',
        limit,
      );
    },

    async settle(settlements: Settlement[], resetCursor: boolean) {
      const db = await open();
      await db.withTransactionAsync(async () => {
        for (const s of settlements) {
          // Opérations plus anciennes de la même donnée : remplacées par celle-ci (coalescence).
          await db.runAsync(
            'DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND seq < ?',
            s.entity,
            s.entityId,
            s.seq,
          );
          if (s.outcome === 'rejected') {
            await db.runAsync(
              'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE op_id = ?',
              s.reason ?? 'Opération refusée.',
              s.opId,
            );
            continue;
          }
          await db.runAsync('DELETE FROM outbox WHERE op_id = ?', s.opId);
          // Plus rien en attente pour cette donnée (une saisie faite PENDANT l'envoi la garde en attente).
          await db.runAsync(
            `UPDATE ${TABLE[s.entity]} SET pending_sync = 0
             WHERE id = ? AND NOT EXISTS (SELECT 1 FROM outbox WHERE entity = ? AND entity_id = ?)`,
            s.entityId,
            s.entity,
            s.entityId,
          );
        }
        if (resetCursor) await writeKv(db, KV_CURSOR, null);
      });
    },

    async readCursor() {
      return readKv(await open(), KV_CURSOR);
    },

    async resetCursor() {
      const db = await open();
      await db.withTransactionAsync(() => writeKv(db, KV_CURSOR, null));
    },

    async applyPull(page: { measurements: MeasurementDto[]; events: LifeEventDto[] }, nextCursor) {
      const db = await open();
      let written = 0;
      await db.withTransactionAsync(async () => {
        const mIds = page.measurements.map((m) => m.id);
        const eIds = page.events.map((e) => e.id);
        const ids = [...mIds, ...eIds];
        // Lectures l'une après l'autre, DANS la transaction : l'état local est celui qu'on va modifier.
        const measurements = mIds.length
          ? await db.getAllAsync<MeasurementRow>(
              `SELECT * FROM measurements WHERE id IN (${marks(mIds.length)})`,
              ...mIds,
            )
          : [];
        const events = eIds.length
          ? await db.getAllAsync<EventRow>(
              `SELECT * FROM events WHERE id IN (${marks(eIds.length)})`,
              ...eIds,
            )
          : [];
        const pending = ids.length
          ? await db.getAllAsync<{ entity: SyncEntity; entity_id: string }>(
              `SELECT entity, entity_id FROM outbox
               WHERE last_error IS NULL AND entity_id IN (${marks(ids.length)})`,
              ...ids,
            )
          : [];
        const plan = planPull(page, {
          measurements: new Map(measurements.map((row) => [row.id, row])),
          events: new Map(events.map((row) => [row.id, row])),
          pending: new Set(pending.map((p) => `${p.entity}:${p.entity_id}`)),
        });
        for (const row of plan.measurements) await saveRow(db, 'measurements', row);
        for (const row of plan.events) await saveRow(db, 'events', row);
        for (const drop of plan.dropPending) {
          await db.runAsync(
            'DELETE FROM outbox WHERE entity = ? AND entity_id = ?',
            drop.entity,
            drop.id,
          );
        }
        await writeKv(db, KV_CURSOR, nextCursor);
        written = plan.measurements.length + plan.events.length;
      });
      return written;
    },

    async counts() {
      const db = await open();
      // Une DONNÉE compte une fois, même avec plusieurs opérations (COUNT DISTINCT ignore les NULL).
      const row = await db.getFirstAsync<{ measurements: number; events: number; failed: number }>(
        `SELECT
           COUNT(DISTINCT CASE WHEN last_error IS NULL AND entity = 'measurement' THEN entity_id END) AS measurements,
           COUNT(DISTINCT CASE WHEN last_error IS NULL AND entity = 'event' THEN entity_id END) AS events,
           COUNT(DISTINCT CASE WHEN last_error IS NOT NULL THEN entity || ':' || entity_id END) AS failed
         FROM outbox`,
      );
      return {
        measurements: row?.measurements ?? 0,
        events: row?.events ?? 0,
        failed: row?.failed ?? 0,
      };
    },

    async listRejected() {
      const db = await open();
      const ops = await db.getAllAsync<
        Pick<OutboxRow, 'op_id' | 'entity' | 'entity_id' | 'type' | 'attempts'> & {
          last_error: string;
        }
      >(
        `SELECT op_id, entity, entity_id, type, attempts, last_error FROM outbox
         WHERE last_error IS NOT NULL ORDER BY seq ASC`,
      );
      const changes: RejectedChange[] = [];
      for (const op of ops) {
        const row = await db.getFirstAsync<MeasurementRow | EventRow>(
          `SELECT * FROM ${TABLE[op.entity]} WHERE id = ?`,
          op.entity_id,
        );
        changes.push({
          opId: op.op_id,
          entity: op.entity,
          entityId: op.entity_id,
          type: op.type,
          reason: op.last_error,
          attempts: op.attempts,
          measurement: op.entity === 'measurement' ? (row as MeasurementRow | null) : null,
          event: op.entity === 'event' ? (row as EventRow | null) : null,
        });
      }
      return changes;
    },

    async retryRejected(opId) {
      const db = await open();
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE outbox SET last_error = NULL WHERE op_id = ?', opId);
      });
    },

    async discardRejected(opId) {
      const db = await open();
      await db.withTransactionAsync(async () => {
        const op = await db.getFirstAsync<{ entity: SyncEntity; entity_id: string }>(
          'SELECT entity, entity_id FROM outbox WHERE op_id = ?',
          opId,
        );
        if (!op) return;
        await db.runAsync(
          'DELETE FROM outbox WHERE entity = ? AND entity_id = ?',
          op.entity,
          op.entity_id,
        );
        await db.runAsync(`DELETE FROM ${TABLE[op.entity]} WHERE id = ?`, op.entity_id);
        // Tout relire : la version du compte (si elle existe) revient sur le téléphone.
        await writeKv(db, KV_CURSOR, null);
      });
    },

    async readLastSuccess() {
      return readKv(await open(), KV_LAST_SUCCESS);
    },

    async writeLastSuccess(iso) {
      const db = await open();
      await db.withTransactionAsync(() => writeKv(db, KV_LAST_SUCCESS, iso));
    },
  };
}
