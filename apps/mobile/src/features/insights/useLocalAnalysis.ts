// Analyse des N derniers jours, calculée sur le téléphone (L8-11) : pour l'écran « Analyse » (L3-04) et
// le travail hors-ligne (L3-09). Relue à chaque retour sur l'écran (ex. après une nouvelle mesure) et à
// chaque changement de période.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { loadLocalAnalysis, type LocalAnalysis } from './local-analysis';

export type LocalAnalysisState =
  | { status: 'loading' }
  | { status: 'error' }
  | ({ status: 'ready'; days: number; now: Date } & LocalAnalysis);

export function useLocalAnalysis(days: number): {
  state: LocalAnalysisState;
  reload: () => void;
} {
  const [state, setState] = useState<LocalAnalysisState>({ status: 'loading' });
  // Numéro de la dernière lecture lancée : une réponse plus ancienne (période changée, écran quitté,
  // « Réessayer ») est ignorée au lieu d'écraser la plus récente.
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    const id = ++lastLoad.current;
    const now = new Date();
    loadLocalAnalysis(days, now.getTime())
      .then((result) => {
        if (id === lastLoad.current) setState({ status: 'ready', days, now, ...result });
      })
      .catch(() => {
        // Base locale illisible : on le dit (avec « Réessayer ») plutôt que « données insuffisantes ».
        if (id === lastLoad.current) setState({ status: 'error' });
      });
  }, [days]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        lastLoad.current += 1; // écran quitté : la lecture en cours ne sert plus
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
