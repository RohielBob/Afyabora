import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncOp } from '@glyka/shared';

export interface OutboxRow {
  seq: number;
  op_id: string;
  entity: 'measurement' | 'event';
  type: 'upsert' | 'delete';
  entity_id: string;
  client_updated_at: string;
  payload: string | null;
  attempts: number;
}

/** À appeler DANS la même transaction que l'écriture de la donnée (atomicité). */
export async function enqueue(db: SQLiteDatabase, op: SyncOp): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (op_id, entity, type, entity_id, client_updated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    op.opId,
    op.entity,
    op.type,
    op.entityId,
    op.clientUpdatedAt,
    op.payload ? JSON.stringify(op.payload) : null,
  );
}

export async function pending(db: SQLiteDatabase, limit = 200): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC LIMIT ?', limit);
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}

/** Supprime les opérations confirmées par le serveur. */
export async function remove(db: SQLiteDatabase, opIds: string[]): Promise<void> {
  for (const id of opIds) await db.runAsync('DELETE FROM outbox WHERE op_id = ?', id);
}

export async function markFailed(db: SQLiteDatabase, opId: string, error: string): Promise<void> {
  await db.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE op_id = ?', error, opId);
}
