// Compte à rebours d'un accès partagé (L5-13, CDC F8 : « Accès valable : 04:37 » puis « Accès expiré »).
// Règles pures, testées sans navigateur (__tests__/countdown.test.ts). L'heure de fin vient du SERVEUR
// (`expiresAt`) et l'heure actuelle aussi (lib/server-clock.ts) : l'horloge de l'ordinateur ne compte pas.
// Le minuteur est INDICATIF : le serveur revérifie l'accès à chaque requête et refuse après la fin.
import { fill, fr } from '@/i18n/fr';

/** Sous ce nombre de secondes, le bandeau passe en « se termine bientôt » (couleur + icône + mot). */
export const SOON_SECONDS = 120;

/** Instants (secondes restantes) annoncés aux lecteurs d'écran : 5 minutes, puis 1 minute. */
export const ANNOUNCE_AT = [300, 60] as const;

/** Secondes restantes (arrondies au-dessus : 0,2 s restante s'affiche « 00:01 »), jamais négatives. */
export function remainingSeconds(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
}

/** « 04:37 » ; au-delà d'une heure « 1:02:05 ». */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export type CountdownTone = 'normal' | 'soon' | 'ended';

/** Ce que montre le bandeau : texte, ton, et la phrase lue en entier par un lecteur d'écran. */
export function countdownView(seconds: number): {
  tone: CountdownTone;
  text: string;
  a11y: string;
} {
  if (seconds <= 0) {
    return { tone: 'ended', text: fr.access.ended, a11y: fr.access.ended };
  }
  const minutes = Math.ceil(seconds / 60);
  return {
    tone: seconds <= SOON_SECONDS ? 'soon' : 'normal',
    text: fill(fr.access.valid, { time: formatCountdown(seconds) }),
    a11y: minutes <= 1 ? fr.access.a11yLastMinute : fill(fr.access.a11yMinutes, { count: minutes }),
  };
}

/**
 * Annonce à faire quand le temps restant passe sous 5 minutes puis sous 1 minute (une seule fois chacune,
 * même si le minuteur saute des secondes : onglet en arrière-plan, ordinateur en veille).
 */
export function announcement(previous: number | null, current: number): string | null {
  if (previous === null) return null;
  if (previous > 60 && current <= 60 && current > 0) return fr.access.announce1;
  if (previous > 300 && current <= 300 && current > 60) return fr.access.announce5;
  return null;
}
