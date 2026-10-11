// Où la saisie écrit (L2-03) : TOUJOURS sur le téléphone d'abord (ADR-0004). La mesure et son opération
// de synchronisation sont écrites dans la même transaction (db/repositories/measurements.repo.ts) ; le
// moteur de synchronisation (L8-06) les enverra au serveur. On n'appelle jamais l'API pour écrire.
// Version web (aperçu de développement, sans SQLite) : local-store.web.ts.
import type { CreateMeasurementInput, UpdateMeasurementInput } from '@glyka/shared';
import { countUnsyncedChanges } from '@/db/reset';
import {
  createMeasurement,
  deleteMeasurement,
  getMeasurement,
  latestMeasurement,
  listMeasurements,
  measurementPoints,
  measurementsInMinute,
  updateMeasurement,
  type LatestMeasurement,
  type LocalMeasurement,
  type MeasurementPoint,
} from '@/db/repositories/measurements.repo';

export type { LatestMeasurement, LocalMeasurement, MeasurementPoint };

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

  /** Mesures complètes (provenance, lot d'import, note) entre deux dates ISO, de la plus récente à la
   * plus ancienne : chronologie (L2-09). */
  list: (fromIso: string, toIso: string): Promise<LocalMeasurement[]> =>
    listMeasurements(fromIso, toIso),

  /** Une mesure (non supprimée), ou null : écran de détail (L2-11). */
  get: (id: string): Promise<LocalMeasurement | null> => getMeasurement(id),

  /** Modifie une mesure (champs donnés seulement) ; l'objet complet part à la synchronisation (L8-03). */
  update: (id: string, patch: UpdateMeasurementInput): Promise<void> =>
    updateMeasurement(id, patch),

  /** Supprime une mesure (pierre tombale, note effacée) ; la suppression part à la synchronisation. */
  remove: (id: string): Promise<void> => deleteMeasurement(id),
};
