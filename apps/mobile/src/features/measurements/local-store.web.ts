// Version web (aperçu de développement dans le navigateur) : expo-sqlite n'y fonctionne pas sans en-têtes
// de sécurité particuliers (voir docs/team/pieges-connus.md). Les mesures sont gardées EN MÉMOIRE le temps
// de la session (db/web-memory.ts), avec leur file d'envoi : depuis L8-06, l'aperçu web se synchronise avec
// le serveur comme un téléphone. Ce n'est pas utilisé sur téléphone. Les lignes et les opérations sont
// construites par les MÊMES plans que sur téléphone (db/repositories/plans.ts) : même forme que SQLite.
import {
  type CreateMeasurementInput,
  type MeasurementContext,
  type UpdateMeasurementInput,
} from '@glyka/shared';
import {
  planMeasurementCreate,
  planMeasurementDelete,
  planMeasurementUpdate,
  type MeasurementRow,
  type Plan,
} from '@/db/repositories/plans';
import { enqueueInMemory, webMemory } from '@/db/web-memory';
import { syncAfterLocalWrite } from '@/features/sync';
import { newId } from '@/lib/uuid';

export interface LatestMeasurement {
  id: string;
  valueMgDl: number;
  measuredAt: string;
  context: MeasurementContext;
  pendingSync: boolean;
}

export interface MeasurementPoint {
  id: string;
  at: number;
  mgDl: number;
  context: MeasurementContext;
}

export type LocalMeasurement = MeasurementRow;

const ctx = () => ({ opId: newId(), now: new Date().toISOString() });

const byDateDesc = (a: MeasurementRow, b: MeasurementRow) =>
  a.measured_at < b.measured_at ? 1 : a.measured_at > b.measured_at ? -1 : 0;

/** Mesures non supprimées. */
const alive = () => [...webMemory.measurements.values()].filter((m) => !m.deleted_at);

/** La ligne ET son opération (comme la transaction SQLite), puis l'envoi programmé. */
function apply(plan: Plan<MeasurementRow>): void {
  webMemory.measurements.set(plan.row.id, plan.row);
  enqueueInMemory(webMemory, plan.op);
  syncAfterLocalWrite();
}

export const localMeasurements = {
  save: async (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => {
    const plan = planMeasurementCreate({ ...input, id: newId() }, ctx());
    apply(plan);
    return plan.row.id;
  },
  sameMinute: async (measuredAt: string) =>
    alive()
      .filter((m) => m.measured_at.slice(0, 16) === measuredAt.slice(0, 16))
      .map((m) => ({ valueMgDl: m.value_mgdl, measuredAt: m.measured_at })),
  latest: async (): Promise<LatestMeasurement | null> => {
    const last = alive().sort(byDateDesc)[0];
    return last
      ? {
          id: last.id,
          valueMgDl: last.value_mgdl,
          measuredAt: last.measured_at,
          context: last.context,
          pendingSync: last.pending_sync === 1,
        }
      : null;
  },
  /** Modifications pas encore envoyées (comme sur téléphone : la file d'envoi entière). */
  pendingCount: async (): Promise<number> => webMemory.outbox.length,
  between: async (from: number, to: number): Promise<MeasurementPoint[]> =>
    alive()
      .map((m) => ({
        id: m.id,
        at: Date.parse(m.measured_at),
        mgDl: m.value_mgdl,
        context: m.context,
      }))
      .filter((p) => p.at >= from && p.at <= to)
      .sort((a, b) => a.at - b.at),
  list: async (fromIso: string, toIso: string): Promise<LocalMeasurement[]> =>
    alive()
      .filter((m) => m.measured_at >= fromIso && m.measured_at < toIso)
      .sort(byDateDesc),
  get: async (id: string): Promise<LocalMeasurement | null> => {
    const row = webMemory.measurements.get(id);
    return row && !row.deleted_at ? row : null;
  },
  update: async (id: string, patch: UpdateMeasurementInput): Promise<void> => {
    const current = webMemory.measurements.get(id);
    if (!current || current.deleted_at) throw new Error(`Mesure introuvable : ${id}`);
    apply(planMeasurementUpdate(current, patch, ctx()));
  },
  remove: async (id: string): Promise<void> => {
    const current = webMemory.measurements.get(id);
    if (!current || current.deleted_at) return;
    apply(planMeasurementDelete(current, ctx()));
  },
};
