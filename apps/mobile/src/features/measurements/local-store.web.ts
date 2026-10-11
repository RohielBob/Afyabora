// Version web (aperçu de développement dans le navigateur) : expo-sqlite n'y fonctionne pas sans en-têtes
// de sécurité particuliers (voir docs/team/pieges-connus.md). Les mesures sont gardées EN MÉMOIRE le temps
// de la session, pour pouvoir tester la saisie, le tableau de bord et la chronologie. Ce n'est pas utilisé
// sur téléphone. Les lignes sont construites par les MÊMES plans que sur téléphone (db/repositories/plans.ts) :
// elles ont exactement la même forme que celles de SQLite.
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
} from '@/db/repositories/plans';
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

let memory: MeasurementRow[] = [];

const ctx = () => ({ opId: newId(), now: new Date().toISOString() });

const byDateDesc = (a: MeasurementRow, b: MeasurementRow) =>
  a.measured_at < b.measured_at ? 1 : a.measured_at > b.measured_at ? -1 : 0;

export const localMeasurements = {
  save: async (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => {
    const { row } = planMeasurementCreate({ ...input, id: newId() }, ctx());
    memory.push(row); // rien n'est jamais envoyé depuis l'aperçu web : pending_sync reste à 1
    return row.id;
  },
  sameMinute: async (measuredAt: string) =>
    memory
      .filter((m) => !m.deleted_at && m.measured_at.slice(0, 16) === measuredAt.slice(0, 16))
      .map((m) => ({ valueMgDl: m.value_mgdl, measuredAt: m.measured_at })),
  latest: async (): Promise<LatestMeasurement | null> => {
    const last = memory.filter((m) => !m.deleted_at).sort(byDateDesc)[0];
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
  pendingCount: async (): Promise<number> => memory.filter((m) => m.pending_sync === 1).length,
  between: async (from: number, to: number): Promise<MeasurementPoint[]> =>
    memory
      .filter((m) => !m.deleted_at)
      .map((m) => ({
        id: m.id,
        at: Date.parse(m.measured_at),
        mgDl: m.value_mgdl,
        context: m.context,
      }))
      .filter((p) => p.at >= from && p.at <= to)
      .sort((a, b) => a.at - b.at),
  list: async (fromIso: string, toIso: string): Promise<LocalMeasurement[]> =>
    memory
      .filter((m) => !m.deleted_at && m.measured_at >= fromIso && m.measured_at < toIso)
      .sort(byDateDesc),
  get: async (id: string): Promise<LocalMeasurement | null> =>
    memory.find((m) => m.id === id && !m.deleted_at) ?? null,
  update: async (id: string, patch: UpdateMeasurementInput): Promise<void> => {
    const current = memory.find((m) => m.id === id && !m.deleted_at);
    if (!current) throw new Error(`Mesure introuvable : ${id}`);
    const { row } = planMeasurementUpdate(current, patch, ctx());
    memory = memory.map((m) => (m.id === id ? row : m));
  },
  remove: async (id: string): Promise<void> => {
    const current = memory.find((m) => m.id === id && !m.deleted_at);
    if (!current) return;
    const { row } = planMeasurementDelete(current, ctx());
    memory = memory.map((m) => (m.id === id ? row : m));
  },
};
