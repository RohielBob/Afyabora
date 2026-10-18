// Secondes d'accès restantes, à l'heure du SERVEUR (L5-13), recalculées chaque seconde et au retour sur
// l'onglet (un onglet en arrière-plan ou un ordinateur en veille ralentit les minuteurs : on ne compte
// jamais les secondes « à la main », on recalcule depuis l'heure de fin).
import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/server-clock';
import { remainingSeconds } from './countdown';

export function useCountdown(expiresAt: string | null): number | null {
  const read = () => (expiresAt ? remainingSeconds(expiresAt, serverNow()) : null);
  const [seconds, setSeconds] = useState<number | null>(read);

  useEffect(() => {
    const update = () => setSeconds(expiresAt ? remainingSeconds(expiresAt, serverNow()) : null);
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [expiresAt]);

  return seconds;
}
