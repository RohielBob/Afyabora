// Version web (aperçu de développement dans le navigateur) : expo-sqlite n'y fonctionne pas sans en-têtes
// de sécurité particuliers (voir docs/team/pieges-connus.md). Les mesures sont gardées EN MÉMOIRE le temps
// de la session, pour pouvoir tester la saisie, le tableau de bord et la chronologie. Ce n'est pas utilisé
// sur téléphone. Les lignes sont construites par les MÊMES plans que sur téléphone (db/repositories/plans.ts) :
// elles ont exactement la même forme que celles de SQLite.
import { type CreateMeasurementInput, type MeasurementContext } from '@glyka/shared';
import { planMeasurementCreate, type MeasurementRow } from '@/db/repositories/plans';
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

const memory: MeasurementRow[] = [];

const byDateDesc = (a: MeasurementRow, b: MeasurementRow) =>
  a.measured_at < b.measured_at ? 1 : a.measured_at > b.measured_at ? -1 : 0;

export const localMeasurements = {
  save: async (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => {
    const { row } = planMeasurementCreate(
      { ...input, id: newId() },
      { opId: newId(), now: new Date().toISOString() },
    );
    memory.push(row); // rien n'est jamais envoyé depuis l'aperçu web : pending_sync reste à 1
    return row.id;
  },
  sameMinute: async (measuredAt: string) =>
    memory
      .filter((m) => m.measured_at.slice(0, 16) === measuredAt.slice(0, 16))
      .map((m) => ({ valueMgDl: m.value_mgdl, measuredAt: m.measured_at })),
  latest: async (): Promise<LatestMeasurement | null> => {
    const last = [...memory].sort(byDateDesc)[0];
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
  pendingCount: async (): Promise<number> => memory.length,
  between: async (from: number, to: number): Promise<MeasurementPoint[]> =>
    memory
      .map((m) => ({
        id: m.id,
        at: Date.parse(m.measured_at),
        mgDl: m.value_mgdl,
        context: m.context,
      }))
      .filter((p) => p.at >= from && p.at <= to)
      .sort((a, b) => a.at - b.at),
  list: async (fromIso: string, toIso: string): Promise<LocalMeasurement[]> =>
    memory.filter((m) => m.measured_at >= fromIso && m.measured_at < toIso).sort(byDateDesc),
};
