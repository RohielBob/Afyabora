// Exécution d'un plan d'écriture (L8-03) : la ligne ET son opération d'outbox, dans UNE transaction.
// Si l'une des deux échoue, SQLite annule tout : jamais de donnée sans opération de synchronisation,
// jamais d'opération sans donnée (ADR-0004).
import type { SQLiteDatabase } from 'expo-sqlite';
import { enqueue } from './outbox.repo';
import type { EventRow, MeasurementRow, Plan } from './plans';

/** Ce dont les dépôts ont besoin de la base (permet de les tester avec une base simulée). */
export type LocalDb = Pick<
  SQLiteDatabase,
  'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withTransactionAsync'
>;

type Table = 'measurements' | 'events';

/** Donnée locale introuvable (ou déjà supprimée) : l'écran peut afficher un message clair. */
export class LocalNotFound extends Error {
  constructor(what: string, id: string) {
    super(`${what} introuvable sur ce téléphone : ${id}`);
    this.name = 'LocalNotFound';
  }
}

/**
 * Crée ou remplace une ligne complète. Les noms de colonnes viennent des types MeasurementRow / EventRow
 * (jamais d'une saisie) ; les valeurs passent en paramètres « ? » (pas d'injection SQL).
 */
export async function saveRow(
  db: LocalDb,
  table: Table,
  row: MeasurementRow | EventRow,
): Promise<void> {
  const columns = Object.keys(row) as (keyof typeof row)[];
  await db.runAsync(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ...columns.map((c) => row[c] as string | number | null),
  );
}

/** Écrit la ligne puis l'opération, dans la transaction en cours (à appeler DANS withTransactionAsync). */
export async function applyPlan(
  db: LocalDb,
  table: Table,
  plan: Plan<MeasurementRow> | Plan<EventRow>,
): Promise<void> {
  await saveRow(db, table, plan.row);
  await enqueue(db, plan.op);
}
