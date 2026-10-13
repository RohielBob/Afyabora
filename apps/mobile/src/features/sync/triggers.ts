// Déclencheurs de la synchronisation (ticket L8-07, ADR-0004) : QUAND le moteur (L8-06) se lance.
//  - Ouverture de l'application avec une session (ou connexion) : tout de suite.
//  - Retour du réseau (hors-ligne ⇒ en ligne) : tout de suite ; c'est ce qui envoie les saisies faites en
//    mode avion, sans attendre l'essai de secours.
//  - Retour dans l'application (arrière-plan ⇒ premier plan) : tout de suite, sauf si la dernière
//    synchronisation réussie date de moins de 30 s (passer d'une application à l'autre ne relance pas tout).
//  - « Tirer pour rafraîchir » (Historique, Accueil) : usePullToRefresh, plus bas.
// Les autres déclencheurs viennent de L8-06 : 3 s après une saisie, fin d'un import.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { onBackOnline } from './connectivity';
import type { SyncState } from './engine';

/** Retour dans l'application : pas de nouvelle synchronisation si la dernière a réussi il y a moins de 30 s. */
export const RESUME_MIN_GAP_MS = 30_000;

/**
 * Faut-il synchroniser à ce changement d'état de l'application ? Seulement quand elle redevient ACTIVE
 * après être passée par l'ARRIÈRE-PLAN (même si elle repasse par « inactive » entre les deux) : Face ID ou
 * le centre de contrôle de l'iPhone passent par « inactive » sans quitter l'application et ne relancent
 * rien. Et pas si la dernière synchronisation réussie est toute récente.
 */
export function shouldSyncOnResume(
  wentToBackground: boolean,
  next: AppStateStatus,
  lastSuccessAt: string | null,
  now: number,
): boolean {
  if (!wentToBackground || next !== 'active') return false;
  if (!lastSuccessAt) return true;
  const last = Date.parse(lastSuccessAt);
  return !Number.isFinite(last) || now - last >= RESUME_MIN_GAP_MS;
}

/** Ce dont les déclencheurs ont besoin (remplaçable dans les tests). */
export interface TriggerDeps {
  request: () => void;
  lastSuccessAt: () => string | null;
  subscribeAppState: (listener: (status: AppStateStatus) => void) => () => void;
  subscribeBackOnline: (listener: () => void) => () => void;
  initialAppState: AppStateStatus;
  now?: () => number;
}

/**
 * Branche les déclencheurs pour une session ouverte : synchronisation immédiate (ouverture ou connexion),
 * puis au retour du réseau et au retour dans l'application. Retourne la fonction qui les débranche
 * (déconnexion).
 */
export function startSyncTriggers(deps: TriggerDeps): () => void {
  const now = deps.now ?? Date.now;
  // Passée par l'arrière-plan depuis la dernière fois où elle était active ?
  let wentToBackground = deps.initialAppState === 'background';
  deps.request();
  const stopNetwork = deps.subscribeBackOnline(() => deps.request());
  const stopAppState = deps.subscribeAppState((next) => {
    if (next === 'background') wentToBackground = true;
    if (next !== 'active') return;
    if (shouldSyncOnResume(wentToBackground, next, deps.lastSuccessAt(), now())) deps.request();
    wentToBackground = false;
  });
  return () => {
    stopNetwork();
    stopAppState();
  };
}

/** Abonnements réels (React Native, NetInfo). */
export const realTriggerSources = {
  subscribeAppState: (listener: (status: AppStateStatus) => void) => {
    const subscription = AppState.addEventListener('change', listener);
    return () => subscription.remove();
  },
  subscribeBackOnline: (listener: () => void) => onBackOnline(listener),
  initialAppState: () => AppState.currentState,
};

/**
 * « Tirer pour rafraîchir » : synchronise maintenant, puis appelle `after` (relire les données locales),
 * même si la synchronisation a échoué (hors-ligne : on relit ce que le téléphone a). `refreshing` reste vrai
 * pendant ce temps (l'indicateur du haut de la liste tourne).
 */
export async function refreshNow(
  sync: () => Promise<SyncState>,
  after: () => void,
  setRefreshing: (value: boolean) => void,
): Promise<SyncState | null> {
  setRefreshing(true);
  try {
    return await sync().catch(() => null);
  } finally {
    after();
    setRefreshing(false);
  }
}

export function usePullToRefresh(
  sync: () => Promise<SyncState>,
  after: () => void,
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const onRefresh = useCallback(() => {
    void refreshNow(sync, after, (value) => {
      if (mounted.current) setRefreshing(value);
    });
  }, [sync, after]);
  return { refreshing, onRefresh };
}
