// Horloge du SERVEUR, vue depuis le portail (L5-13). Le compte à rebours d'un accès partagé doit suivre
// l'heure du serveur : l'horloge de l'ordinateur du médecin peut avancer ou retarder de plusieurs minutes.
//  - Chaque réponse de l'API porte l'en-tête HTTP `Date` (heure du serveur, à la seconde près, exposé par
//    CORS). On en déduit l'écart avec l'horloge de l'ordinateur : serverNow() = Date.now() + écart.
//  - `Date` est arrondi à la seconde inférieure : on ajoute une demi-seconde (le milieu de la seconde) ;
//    l'erreur restante (≤ 0,5 s + le temps de la réponse) ne compte pas pour un minuteur affiché à la seconde.
//  - Sans en-tête lisible : écart 0 (horloge de l'ordinateur). Le minuteur reste INDICATIF : le serveur
//    revérifie l'accès à chaque requête.
let offsetMs = 0;

/** Note l'heure du serveur lue dans l'en-tête `Date` d'une réponse reçue à `receivedAt` (ms). */
export function noteServerDate(header: string | null, receivedAt: number = Date.now()): void {
  if (!header) return;
  const serverMs = Date.parse(header);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs + 500 - receivedAt;
}

/** Heure actuelle du serveur (estimée), en millisecondes. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Écart actuel serveur − ordinateur (tests, diagnostic). */
export function serverOffsetMs(): number {
  return offsetMs;
}

/** Remet l'écart à zéro (tests). */
export function resetServerClock(): void {
  offsetMs = 0;
}
