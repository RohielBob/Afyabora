// Où la saisie écrit (L2-03) : TOUJOURS sur le téléphone d'abord (ADR-0004). La mesure et son opération
// de synchronisation sont écrites dans la même transaction (db/repositories/measurements.repo.ts) ; le
// moteur de synchronisation (L8-06) les enverra au serveur. On n'appelle jamais l'API pour écrire.
// Version web (aperçu de développement, sans SQLite) : local-store.web.ts.
import type { CreateMeasurementInput } from '@glyka/shared';
import { countUnsyncedChanges } from '@/db/reset';
import {
  createMeasurement,
  latestMeasurement,
  measurementPoints,
  measurementsInMinute,
  type LatestMeasurement,
  type MeasurementPoint,
} from '@/db/repositories/measurements.repo';

export type { LatestMeasurement, MeasurementPoint };

export const localMeasurements = {
  /** Enregistre la mesure sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). */
  save: (input: Omit<CreateMeasurementInput, 'id'>): Promise<string> => createMeasurement(input),

  /** Mesures de la même minute (avertissement de doublon exact). */
  sameMinute: (measuredAt: string) => measurementsInMinute(measuredAt),

  /** Dernière mesure, pour le tableau de bord (L2-05) ; null s'il n'y en a pas encore. */
  latest: (): Promise<LatestMeasurement | null> => latestMeasurement(),

  /** Modifications pas encore envoyées au serveur (file d'envoi). 0 si la base ne répond pas. */
  pendingCount: (): Promise<number> => countUnsyncedChanges(),

  /** Mesures entre deux instants (ms), de la plus ancienne à la plus récente : graphique (L2-06). */
  between: (from: number, to: number): Promise<MeasurementPoint[]> =>
    measurementPoints(new Date(from).toISOString(), new Date(to).toISOString()),
};
