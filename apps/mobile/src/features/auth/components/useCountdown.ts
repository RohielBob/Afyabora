// Compte à rebours en secondes (ex. « Renvoyer l'email dans 45 s ») : évite d'appuyer en boucle sur un bouton
// qui envoie un email (l'API limite aussi : 5 demandes par minute).
import { useCallback, useEffect, useState } from 'react';

export function useCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const start = useCallback((duration: number) => setSeconds(duration), []);
  return { seconds, running: seconds > 0, start };
}
