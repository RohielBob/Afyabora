// Données de la chronologie (L2-09), lues SUR LE TÉLÉPHONE (sans réseau) : mesures + événements des
// 30 derniers jours, puis 30 de plus à chaque « Voir les 30 jours précédents ». Relues à chaque retour sur
// l'onglet (ex. après une saisie).
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { GlucoseThresholds, GlucoseUnit } from '@glyka/shared';
import { localEvents } from '@/features/events';
import { localMeasurements, readUnit } from '@/features/measurements';
import { readThresholds } from '@/features/profile';
import { fromEvent, fromMeasurement, windowBounds, type TimelineItem } from './timeline';

export type TimelineState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      items: TimelineItem[];
      thresholds: GlucoseThresholds;
      unit: GlucoseUnit;
      now: Date;
      /** Nombre de fenêtres de 30 jours chargées. */
      pages: number;
      /** La dernière fenêtre ajoutée n'a rien apporté : on n'affiche plus « Voir plus ». */
      exhausted: boolean;
      /** Chargement d'une fenêtre de plus en cours. */
      loadingMore: boolean;
    };

export function useTimeline(): {
  state: TimelineState;
  loadMore: () => void;
  reload: () => void;
} {
  const [state, setState] = useState<TimelineState>({ status: 'loading' });
  const lastLoad = useRef(0);
  const pagesRef = useRef(1);

  const load = useCallback((pages: number, previousCount: number | null) => {
    const id = ++lastLoad.current;
    const now = new Date();
    const { fromIso, toIso } = windowBounds(pages, now);
    Promise.all([
      localMeasurements.list(fromIso, toIso),
      localEvents.list(fromIso, toIso),
      readThresholds(),
    ])
      .then(([measurements, events, thresholds]) => {
        if (id !== lastLoad.current) return;
        const items = [...measurements.map(fromMeasurement), ...events.map(fromEvent)];
        pagesRef.current = pages;
        setState({
          status: 'ready',
          items,
          thresholds,
          unit: readUnit(),
          now,
          pages,
          exhausted: previousCount !== null && items.length === previousCount,
          loadingMore: false,
        });
      })
      .catch(() => {
        if (id === lastLoad.current) setState({ status: 'error' });
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(pagesRef.current, null);
      return () => {
        lastLoad.current += 1; // onglet quitté : la lecture en cours ne sert plus
      };
    }, [load]),
  );

  return {
    state,
    loadMore: () => {
      if (state.status !== 'ready' || state.loadingMore) return;
      setState({ ...state, loadingMore: true });
      load(state.pages + 1, state.items.length);
    },
    reload: () => {
      setState({ status: 'loading' });
      load(pagesRef.current, null);
    },
  };
}
