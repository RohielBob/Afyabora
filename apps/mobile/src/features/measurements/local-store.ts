// Où la saisie écrit (L2-03) : TOUJOURS sur le téléphone d'abord (ADR-0004). La mesure et son opération
// de synchronisation sont écrites dans la même transaction (db/repositories/measurements.repo.ts) ; le
// moteur de synchronisation (L8-06) les enverra au serveur. On n'appelle jamais l'API pour écrire.
// Version web (aperçu de développement, sans SQLite) : local-store.web.ts.
import type { CreateMeasurementInput } from '@glyka/shared';
import { createMeasurement, measurementsInMinute } from '@/db/repositories/measurements.repo';

export const localMeasurements = {
  /** Enregistre la mesure sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). */
  save: (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => createMeasurement(input),

  /** Mesures de la même minute (avertissement de doublon exact). */
  sameMinute: (measuredAt: string) => measurementsInMinute(measuredAt),
};
