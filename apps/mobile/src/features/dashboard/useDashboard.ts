// Données du tableau de bord (L2-05), lues SUR LE TÉLÉPHONE uniquement (CDC F3 : il marche sans réseau) :
// dernière mesure, modifications en attente d'envoi, seuils du patient et unité préférée.
// Rechargées à chaque retour sur l'onglet (ex. après avoir noté une mesure avec le bouton « + »).
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { GlucoseThresholds, GlucoseUnit } from '@glyka/shared';
import { CHART_PERIODS, periodBounds, type ChartPoint } from './chart';
import { previousBounds } from './stats';
import { localMeasurements, readUnit, type LatestMeasurement } from '@/features/measurements';
import { readThresholds } from '@/features/profile';

export type DashboardState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      latest: LatestMeasurement | null;
      pending: number;
      /**
       * Mesures de la plus longue période (90 jours) ET de la période précédente (90 jours d'avant, pour la
       * comparaison L2-07), de la plus ancienne à la plus récente.
       */
      points: ChartPoint[];
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
    const now = new Date();
    // Une seule lecture pour toutes les périodes : la plus longue et celle d'avant (comparaison),
    // chaque période filtre ensuite en mémoire.
    const longestDays = CHART_PERIODS[CHART_PERIODS.length - 1] as 90;
    const longest = {
      from: previousBounds(longestDays, now).from,
      to: periodBounds(longestDays, now).to,
    };
    Promise.all([
      localMeasurements.latest(),
      localMeasurements.pendingCount(),
      localMeasurements.between(longest.from, longest.to),
      readThresholds(),
    ])
      .then(([latest, pending, points, thresholds]) => {
        if (id === lastLoad.current)
          setState({
            status: 'ready',
            latest,
            pending,
            points,
            thresholds,
            unit: readUnit(),
            now,
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
