// Branche le suivi en direct (watch.ts) sur un écran React (L5-08) : vraie horloge, vraies minuteries ;
// pause quand l'application passe en arrière-plan (aucune requête inutile), relecture immédiate au retour.
// Quitter l'écran arrête tout.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { sharingApi } from './api';
import { createShareWatcher, type ShareWatcher, type WatchState } from './watch';

export interface ShareWatch {
  state: WatchState | null;
  /** Relit l'état tout de suite (ex. après « Mettre fin à l'accès »). */
  refresh: () => void;
}

export function useShareWatch(sessionId: string | null): ShareWatch {
  const watcher = useRef<ShareWatcher | null>(null);
  const [state, setState] = useState<WatchState | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    const created = createShareWatcher({
      sessionId,
      getStatus: sharingApi.status,
      now: () => Date.now(),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      onChange: setState,
    });
    watcher.current = created;
    setState(created.get());
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') created.refresh();
      else if (status === 'background') created.pause();
    });
    return () => {
      appState.remove();
      created.stop();
      watcher.current = null;
    };
  }, [sessionId]);

  // Fonction stable : un écran peut la mettre dans les dépendances d'un effet sans le relancer à chaque rendu.
  const refresh = useCallback(() => watcher.current?.refresh(), []);
  return { state, refresh };
}
