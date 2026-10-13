// Le moteur de synchronisation de l'application (L8-06) : UN seul moteur, branché sur la vraie base locale
// (store.ts, ou store.web.ts pour l'aperçu web) et sur la vraie API. Les réponses du serveur sont vérifiées
// avec les schémas partagés avant d'être appliquées : une réponse inattendue est une erreur (nouvel essai
// plus tard), jamais une donnée écrite à moitié.
import { useEffect, useSyncExternalStore } from 'react';
import { syncPullResponseSchema, syncPushResponseSchema } from '@glyka/shared';
import { api } from '@/lib/api-client';
import { getAccessToken } from '@/lib/secure-storage';
import { isOnline } from './connectivity';
import { createSyncEngine, type SyncState } from './engine';
import { WRITE_DEBOUNCE_MS } from './rules';
import { syncStore } from './store';
import { realTriggerSources, startSyncTriggers, usePullToRefresh } from './triggers';

/** Un lot de 200 opérations peut dépasser le délai habituel (15 s) sur une connexion lente. */
const PUSH_TIMEOUT_MS = 30_000;

const engine = createSyncEngine({
  store: syncStore,
  api: {
    push: async (body) =>
      syncPushResponseSchema.parse(
        await api<unknown>('/sync/push', { method: 'POST', body, timeoutMs: PUSH_TIMEOUT_MS }),
      ),
    pull: async (cursor, limit) => {
      const query = `limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      return syncPullResponseSchema.parse(await api<unknown>(`/sync/pull?${query}`));
    },
  },
  canSync: async () => Boolean(await getAccessToken()),
  isOnline,
});

/** Synchronise dès que possible (fin d'un import, connexion, retour du réseau…). */
export function requestSync(): void {
  engine.request(0);
}

/** Après une saisie sur le téléphone : synchronisation dans 3 s (les saisies rapprochées partent ensemble). */
export function syncAfterLocalWrite(): void {
  engine.request(WRITE_DEBOUNCE_MS);
}

/** Synchronise maintenant et attend la fin (« tirer pour rafraîchir », L8-07). */
export function syncNow(): Promise<SyncState> {
  return engine.runNow();
}

/** Déconnexion : à appeler AVANT d'effacer la base locale (plus aucune écriture du moteur ensuite). */
export function stopSync(): Promise<void> {
  return engine.stop();
}

/** Prévient quand la réception a changé des données locales (chronologie, tableau de bord). */
export function onSyncedData(listener: () => void): () => void {
  return engine.onDataChanged(listener);
}

/** État de la synchronisation pour l'interface (L8-10). */
export function useSyncState(): SyncState {
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}

/**
 * Déclencheurs de la session (L8-07) : à monter UNE fois, à la racine de l'application. Session ouverte ⇒
 * synchronisation tout de suite (ouverture ou connexion), puis au retour du réseau et au retour dans
 * l'application. Session fermée ⇒ débranchés.
 */
export function useSyncTriggers(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return undefined;
    return startSyncTriggers({
      request: requestSync,
      lastSuccessAt: () => engine.getState().lastSuccessAt,
      subscribeAppState: realTriggerSources.subscribeAppState,
      subscribeBackOnline: realTriggerSources.subscribeBackOnline,
      initialAppState: realTriggerSources.initialAppState(),
    });
  }, [signedIn]);
}

/**
 * « Tirer pour rafraîchir » (L8-07) : synchronise maintenant, puis `after` relit l'écran SANS l'effacer
 * (ex. le nombre de mesures en attente baisse après l'envoi, même si rien n'est arrivé du serveur).
 */
export function useSyncRefresh(after: () => void): { refreshing: boolean; onRefresh: () => void } {
  return usePullToRefresh(syncNow, after);
}
