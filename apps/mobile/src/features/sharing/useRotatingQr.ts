// Branche le contrôleur de rotation (rotation.ts) sur un écran React (L5-07) : vraie horloge, vraies
// minuteries, retour dans l'application (une minuterie peut avoir été suspendue en arrière-plan), et une
// horloge qui avance chaque seconde pour le compte à rebours. Quitter l'écran arrête tout.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { CreateShareResponse } from '@glyka/shared';
import { sharingApi } from './api';
import { createQrRotator, type QrRotator, type RotationState } from './rotation';

export interface RotatingQr {
  state: RotationState | null;
  /** Heure du téléphone, mise à jour chaque seconde (compte à rebours). */
  now: number;
  retryNow: () => void;
  stop: () => void;
}

export function useRotatingQr(share: CreateShareResponse | null): RotatingQr {
  const rotator = useRef<QrRotator | null>(null);
  const [state, setState] = useState<RotationState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!share) return undefined;
    const created = createQrRotator({
      sessionId: share.session.id,
      first: share.token,
      rotate: sharingApi.rotate,
      now: () => Date.now(),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      onChange: setState,
    });
    rotator.current = created;
    setState(created.get());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        setNow(Date.now());
        created.resume();
      }
    });
    return () => {
      clearInterval(tick);
      appState.remove();
      created.stop();
      rotator.current = null;
    };
  }, [share]);

  // Fonctions stables : un écran peut les mettre dans les dépendances d'un effet sans le relancer à chaque rendu.
  const retryNow = useCallback(() => rotator.current?.retryNow(), []);
  const stop = useCallback(() => rotator.current?.stop(), []);
  return { state, now, retryNow, stop };
}
