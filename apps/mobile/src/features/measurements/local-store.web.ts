// Version web (aperçu de développement dans le navigateur) : expo-sqlite n'y fonctionne pas sans en-têtes
// de sécurité particuliers (voir docs/team/pieges-connus.md). Les mesures sont gardées EN MÉMOIRE le temps
// de la session, pour pouvoir tester l'écran de saisie et le tableau de bord. Ce n'est pas utilisé sur
// téléphone.
import { toMgDl, type CreateMeasurementInput, type MeasurementContext } from '@glyka/shared';
import { newId } from '@/lib/uuid';

export interface LatestMeasurement {
  id: string;
  valueMgDl: number;
  measuredAt: string;
  context: MeasurementContext;
  pendingSync: boolean;
}

const memory: LatestMeasurement[] = [];

export const localMeasurements = {
  save: async (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => {
    const id = newId();
    memory.push({
      id,
      valueMgDl: toMgDl(input.value, input.unit),
      measuredAt: input.measuredAt,
      context: input.context,
      pendingSync: true, // rien n'est jamais envoyé depuis l'aperçu web
    });
    return id;
  },
  sameMinute: async (measuredAt: string) =>
    memory.filter((m) => m.measuredAt.slice(0, 16) === measuredAt.slice(0, 16)),
  latest: async (): Promise<LatestMeasurement | null> =>
    memory.reduce<LatestMeasurement | null>(
      (last, m) => (!last || m.measuredAt > last.measuredAt ? m : last),
      null,
    ),
  pendingCount: async (): Promise<number> => memory.length,
};
