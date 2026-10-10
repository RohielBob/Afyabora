// Version web (aperçu de développement dans le navigateur) : expo-sqlite n'y fonctionne pas sans en-têtes
// de sécurité particuliers (voir docs/team/pieges-connus.md). Les mesures sont gardées EN MÉMOIRE le temps
// de la session, pour pouvoir tester l'écran de saisie. Ce n'est pas utilisé sur téléphone.
import { toMgDl, type CreateMeasurementInput } from '@glyka/shared';
import { newId } from '@/lib/uuid';

const memory: { id: string; valueMgDl: number; measuredAt: string }[] = [];

export const localMeasurements = {
  save: async (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => {
    const id = newId();
    memory.push({ id, valueMgDl: toMgDl(input.value, input.unit), measuredAt: input.measuredAt });
    return id;
  },
  sameMinute: async (measuredAt: string) =>
    memory.filter((m) => m.measuredAt.slice(0, 16) === measuredAt.slice(0, 16)),
};
