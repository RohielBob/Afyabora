// Réveil du serveur. L'API est hébergée gratuitement (Render) : après 15 minutes sans visite, elle s'endort,
// et la PREMIÈRE requête suivante attend jusqu'à environ une minute qu'elle redémarre. Vu sur un vrai
// téléphone (2026-10-20) : l'inscription abandonnait au bout de 15 s et affichait « serveur injoignable ».
//
// Dès l'ouverture de l'application, on envoie donc une petite requête `GET /health` (sans donnée, sans
// jeton) qui réveille le serveur pendant que la personne lit l'écran ou remplit le formulaire. Elle a son
// propre délai, long, et son échec est silencieux : elle ne sert qu'à réveiller.
import { API_URL } from './config';

/** Délai du réveil : le temps de démarrage observé du serveur, avec de la marge. */
export const WAKE_TIMEOUT_MS = 90_000;

let pending: Promise<boolean> | null = null;

/**
 * Réveille le serveur (une seule requête à la fois, même si on l'appelle plusieurs fois). Renvoie vrai si
 * le serveur a répondu. `fetcher` sert aux tests.
 */
export function wakeServer(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (pending) return pending;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);
  pending = fetcher(`${API_URL}/health`, { signal: controller.signal })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      clearTimeout(timer);
      pending = null;
    });
  return pending;
}
