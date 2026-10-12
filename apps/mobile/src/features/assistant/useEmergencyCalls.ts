// Numéros à appeler en cas d'urgence (L9-09), lus UNE fois dans le profil à l'ouverture de la conversation :
// ils restent disponibles si le réseau tombe ensuite. Sans profil lisible (hors-ligne dès l'ouverture),
// aucune touche d'appel : le texte invite à appeler les secours, sans jamais deviner un numéro.
import { useEffect, useState } from 'react';
import { profileApi } from '@/features/profile';
import { emergencyCalls, type EmergencyCall } from './presentation';

export function useEmergencyCalls(): EmergencyCall[] {
  const [calls, setCalls] = useState<EmergencyCall[]>([]);
  useEffect(() => {
    let current = true;
    profileApi
      .get()
      .then((profile) => {
        if (current) setCalls(emergencyCalls(profile));
      })
      .catch(() => undefined); // hors-ligne ou profil absent : pas de touche d'appel
    return () => {
      current = false;
    };
  }, []);
  return calls;
}
