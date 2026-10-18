// Mesures : lecture/écriture LOCALE. Toute écriture empile une opération dans l'outbox,
// dans la même transaction : jamais de mesure sans opération de synchronisation associée.
// L8-03 : la logique des écritures est dans plans.ts (testée) ; ici, seulement la base de données.
import type {
  CreateMeasurementInput,
  MeasurementContext,
  MeasurementSource,
  UpdateMeasurementInput,
} from '@glyka/shared';
import { newId } from '@/lib/uuid';
import { getDb } from '../client';
import {
  planMeasurementCreate,
  planMeasurementDelete,
  planMeasurementUpdate,
  type MeasurementRow,
} from './plans';
import { LocalNotFound, applyPlan } from './write';

/** Mesure telle qu'elle est gardée sur le téléphone (toutes les colonnes). */
export type LocalMeasurement = MeasurementRow;

const nowIso = () => new Date().toISOString();

/**
 * Crée une mesure sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). Saisie manuelle
 * par défaut ; l'import (L4) précisera la provenance et son lot.
 */
export async function createMeasurement(
  input: Omit<CreateMeasurementInput, 'id'>,
  origin: { source?: MeasurementSource; importBatchId?: string | null } = {},
): Promise<string> {
  const db = await getDb();
  const plan = planMeasurementCreate(
    { ...input, id: newId() },
    { opId: newId(), now: nowIso() },
    origin,
  );
  await db.withTransactionAsync(() => applyPlan(db, 'measurements', plan));
  return plan.row.id;
}

/** Mesure non supprimée, ou null. */
export async function getMeasurement(id: string): Promise<LocalMeasurement | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalMeasurement>(
    'SELECT * FROM measurements WHERE id = ? AND deleted_at IS NULL',
    id,
  );
}

/** Mesures non supprimées entre deux dates ISO UTC (début inclus, fin exclue), de la plus récente à la plus ancienne. */
export async function listMeasurements(
  fromIso: string,
  toIso: string,
): Promise<LocalMeasurement[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMeasurement>(
    `SELECT * FROM measurements
     WHERE deleted_at IS NULL AND measured_at >= ? AND measured_at < ?
     ORDER BY measured_at DESC`,
    fromIso,
    toIso,
  );
}

/**
 * Modifie une mesure (champs donnés seulement ; valeur et unité ensemble). L'objet COMPLET part à la
 * synchronisation (« la dernière écriture gagne »), confirmation « inhabituelle » comprise.
 */
export async function updateMeasurement(id: string, patch: UpdateMeasurementInput): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<MeasurementRow>(
      'SELECT * FROM measurements WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!current) throw new LocalNotFound('Mesure', id);
    await applyPlan(
      db,
      'measurements',
      planMeasurementUpdate(current, patch, { opId: newId(), now: nowIso() }),
    );
  });
}

/** Supprime une mesure (pierre tombale, note effacée). Déjà supprimée ou absente : rien à faire. */
export async function deleteMeasurement(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<MeasurementRow>(
      'SELECT * FROM measurements WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!current) return;
    await applyPlan(
      db,
      'measurements',
      planMeasurementDelete(current, { opId: newId(), now: nowIso() }),
    );
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

/** Dernière mesure (la plus récente par date de mesure), pour le tableau de bord (L2-05). */
export interface LatestMeasurement {
  id: string;
  valueMgDl: number;
  measuredAt: string;
  context: MeasurementContext;
  /** Provenance (L4-09) : saisie, import (avec son lot) ou appareil. */
  source: MeasurementSource;
  importBatchId: string | null;
  /** Pas encore envoyée au serveur. */
  pendingSync: boolean;
}

/**
 * Mesure non supprimée la plus récente, ou null s'il n'y en a aucune. Les dates sont en ISO UTC
 * (« …Z ») : l'ordre du texte est l'ordre chronologique, et l'index sur measured_at sert.
 */
export async function latestMeasurement(): Promise<LatestMeasurement | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    valueMgDl: number;
    measuredAt: string;
    context: MeasurementContext;
    source: MeasurementSource;
    importBatchId: string | null;
    pendingSync: number;
  }>(
    `SELECT id, value_mgdl AS valueMgDl, measured_at AS measuredAt, context, source,
            import_batch_id AS importBatchId, pending_sync AS pendingSync
     FROM measurements
     WHERE deleted_at IS NULL
     ORDER BY measured_at DESC
     LIMIT 1`,
  );
  return row ? { ...row, pendingSync: row.pendingSync === 1 } : null;
}

/** Point du graphique d'évolution (L2-06). */
export interface MeasurementPoint {
  id: string;
  /** Instant de la mesure (ms depuis epoch). */
  at: number;
  mgDl: number;
  context: MeasurementContext;
}

/**
 * Mesures non supprimées entre deux dates ISO UTC (début inclus, fin incluse), de la plus ancienne à la plus
 * récente. Seules les colonnes utiles au graphique sont lues (rapide même avec des milliers de mesures).
 */
export async function measurementPoints(
  fromIso: string,
  toIso: string,
): Promise<MeasurementPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    measuredAt: string;
    mgDl: number;
    context: MeasurementContext;
  }>(
    `SELECT id, measured_at AS measuredAt, value_mgdl AS mgDl, context
     FROM measurements
     WHERE deleted_at IS NULL AND measured_at >= ? AND measured_at <= ?
     ORDER BY measured_at ASC`,
    fromIso,
    toIso,
  );
  return rows.map((r) => ({
    id: r.id,
    at: Date.parse(r.measuredAt),
    mgDl: r.mgDl,
    context: r.context,
  }));
}
