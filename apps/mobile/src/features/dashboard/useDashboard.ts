// Données du tableau de bord (L2-05), lues SUR LE TÉLÉPHONE uniquement (CDC F3 : il marche sans réseau) :
// dernière mesure, modifications en attente d'envoi, seuils du patient et unité préférée.
// Rechargées à chaque retour sur l'onglet (ex. après avoir noté une mesure avec le bouton « + »).
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { GlucoseThresholds, GlucoseUnit } from '@glyka/shared';
import { localMeasurements, readUnit, type LatestMeasurement } from '@/features/measurements';
import { readThresholds } from '@/features/profile';

export type DashboardState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      latest: LatestMeasurement | null;
      pending: number;
      thresholds: GlucoseThresholds;
      unit: GlucoseUnit;
      /** Heure de la lecture, pour « il y a 12 min ». */
      now: Date;
    };

export function useDashboard(): { state: DashboardState; reload: () => void } {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  // Numéro de la dernière lecture lancée : une réponse plus ancienne (écran quitté, « Réessayer » appuyé
  // entre-temps) est ignorée au lieu d'écraser la plus récente.
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    const id = ++lastLoad.current;
    Promise.all([localMeasurements.latest(), localMeasurements.pendingCount(), readThresholds()])
      .then(([latest, pending, thresholds]) => {
        if (id === lastLoad.current)
          setState({
            status: 'ready',
            latest,
            pending,
            thresholds,
            unit: readUnit(),
            now: new Date(),
          });
      })
      .catch(() => {
        // Base locale illisible : on le dit (avec « Réessayer ») plutôt que d'afficher « aucune mesure ».
        if (id === lastLoad.current) setState({ status: 'error' });
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        lastLoad.current += 1; // onglet quitté : la lecture en cours ne sert plus
      };
    }, [load]),
  );

  return {
    state,
    reload: () => {
      setState({ status: 'loading' });
      load();
    },
  };
}
