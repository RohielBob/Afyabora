// Mesures : lecture/écriture LOCALE. Toute écriture empile une opération dans l'outbox,
// dans la même transaction : jamais de mesure sans opération de synchronisation associée.
import type { CreateMeasurementInput } from '@glyka/shared';
import { toMgDl } from '@glyka/shared';
import { newId } from '@/lib/uuid';
import { getDb } from '../client';
import { enqueue } from './outbox.repo';

export interface LocalMeasurement {
  id: string;
  value_mgdl: number;
  original_value: number;
  original_unit: string;
  measured_at: string;
  context: string;
  source: string;
  note: string | null;
  pending_sync: number;
}

export async function createMeasurement(
  input: Omit<CreateMeasurementInput, 'id'>,
): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();
  const payload: CreateMeasurementInput = { ...input, id };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO measurements
        (id, value_mgdl, original_value, original_unit, measured_at, context, source, note,
         client_updated_at, updated_at, pending_sync)
       VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, 1)`,
      id,
      toMgDl(input.value, input.unit),
      input.value,
      input.unit,
      input.measuredAt,
      input.context,
      input.note ?? null,
      now,
      now,
    );
    await enqueue(db, {
      opId: newId(),
      entity: 'measurement',
      type: 'upsert',
      entityId: id,
      clientUpdatedAt: now,
      payload,
    });
  });
  return id;
}

export async function listMeasurements(
  fromIso: string,
  toIso: string,
): Promise<LocalMeasurement[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMeasurement>(
    `SELECT id, value_mgdl, original_value, original_unit, measured_at, context, source, note, pending_sync
     FROM measurements
     WHERE deleted_at IS NULL AND measured_at >= ? AND measured_at < ?
     ORDER BY measured_at DESC`,
    fromIso,
    toIso,
  );
}

export async function deleteMeasurement(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE measurements SET deleted_at = ?, updated_at = ?, pending_sync = 1 WHERE id = ?',
      now,
      now,
      id,
    );
    await enqueue(db, {
      opId: newId(),
      entity: 'measurement',
      type: 'delete',
      entityId: id,
      clientUpdatedAt: now,
    });
  });
}
/**
 * Mesures non supprimées dans la même minute que `measuredAt` (L2-03 : avertissement de doublon exact).
 * Comparaison sur la minute UTC : les dates sont stockées en ISO UTC (« …T08:30:00.000Z »).
 */
export async function measurementsInMinute(
  measuredAt: string,
): Promise<{ valueMgDl: number; measuredAt: string }[]> {
  const db = await getDb();
  const minute = measuredAt.slice(0, 16); // « AAAA-MM-JJTHH:MM »
  return db.getAllAsync<{ valueMgDl: number; measuredAt: string }>(
    `SELECT value_mgdl AS valueMgDl, measured_at AS measuredAt
     FROM measurements
     WHERE deleted_at IS NULL AND substr(measured_at, 1, 16) = ?`,
    minute,
  );
}

// TODO(L8-03) : updateMeasurement, repositories d'événements (events.repo.ts), mapping vers GlucosePoint.
