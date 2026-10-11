// Fuseau horaire du patient (L3-02) : les créneaux (matin, midi, soir, nuit) et les jours (couverture,
// jours sans mesure) se comptent à l'heure LOCALE du patient, pas en UTC.
//
// Un fuseau n'est pas toujours un décalage fixe : Paris est à UTC+2 l'été et UTC+1 l'hiver, New York à
// UTC−4 puis UTC−5. Un décalage fixe se tromperait d'une heure pendant la moitié de l'année (une mesure à
// 23 h 30 tomberait le lendemain, une mesure à 10 h 30 passerait au créneau « midi »). Le moteur accepte
// donc trois formes :
//   - un décalage fixe en minutes : 60 (Kinshasa, UTC+1, sans heure d'été) — valeur par défaut ;
//   - un nom de fuseau IANA : « Africa/Kinshasa », « Europe/Paris »… (heure d'été appliquée) ;
//   - une fonction instant → décalage : sur le téléphone, `(at) => -new Date(at).getTimezoneOffset()`.

/** Fuseau du patient : décalage fixe (minutes, UTC+1 → 60), nom IANA, ou fonction instant → décalage. */
export type PatientTimeZone = number | string | ((at: number) => number);

/** Fuseau par défaut : Kinshasa, UTC+1 toute l'année. */
export const DEFAULT_TIME_ZONE: PatientTimeZone = 60;

/** Décalages possibles sur Terre : de UTC−12 (−720 min) à UTC+14 (+840 min). */
const MIN_OFFSET = -12 * 60;
const MAX_OFFSET = 14 * 60;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Fuseau inconnu ou décalage impossible : erreur claire plutôt qu'une analyse silencieusement fausse. */
export class InvalidTimeZoneError extends Error {
  constructor(value: unknown) {
    super(`Fuseau horaire invalide : ${String(value)}`);
    this.name = 'InvalidTimeZoneError';
  }
}

function checkOffset(offset: number, source: unknown): number {
  if (!Number.isInteger(offset) || offset < MIN_OFFSET || offset > MAX_OFFSET) {
    throw new InvalidTimeZoneError(source);
  }
  return offset;
}

/** Un formateur par nom de fuseau : le créer coûte cher, on le réutilise pour toutes les mesures. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      throw new InvalidTimeZoneError(zone); // nom inconnu (« Mars/Olympus »)
    }
    formatters.set(zone, f);
  }
  return f;
}

/**
 * Décalage d'un fuseau IANA à un instant donné. On demande l'heure locale (année, mois, jour, heure,
 * minute, seconde) et on la compare à l'instant UTC : la différence est le décalage.
 */
function ianaOffset(zone: string, at: number): number {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(zone).formatToParts(new Date(at))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  // Certains moteurs écrivent minuit « 24 » au lieu de « 0 » : même instant, on le ramène à 0.
  const hour = parts.hour === 24 ? 0 : (parts.hour as number);
  const asUtc = Date.UTC(
    parts.year as number,
    (parts.month as number) - 1,
    parts.day as number,
    hour,
    parts.minute as number,
    parts.second as number,
  );
  // Le formateur ignore les millisecondes (moins d'une seconde d'écart) : l'arrondi à la minute les efface.
  return Math.round((asUtc - at) / MINUTE_MS);
}

/**
 * Transforme le fuseau en fonction « instant → décalage en minutes ». Vérifie le fuseau tout de suite
 * (nom inconnu ou décalage impossible ⇒ InvalidTimeZoneError), avant toute analyse.
 */
export function resolveTimeZone(zone: PatientTimeZone = DEFAULT_TIME_ZONE): (at: number) => number {
  if (typeof zone === 'number') {
    const offset = checkOffset(zone, zone);
    return () => offset;
  }
  if (typeof zone === 'string') {
    formatterFor(zone);
    return (at) => checkOffset(ianaOffset(zone, at), zone);
  }
  if (typeof zone === 'function') return (at) => checkOffset(zone(at), 'fonction de fuseau');
  throw new InvalidTimeZoneError(zone);
}

/** Décalage du fuseau du patient à l'instant `at` (minutes, UTC+1 → 60). */
export function offsetAt(at: number, zone: PatientTimeZone = DEFAULT_TIME_ZONE): number {
  return resolveTimeZone(zone)(at);
}

/** Heure locale (0–23) du patient à l'instant `at`. */
export function localHour(at: number, offsetMinutes: number): number {
  return new Date(at + offsetMinutes * MINUTE_MS).getUTCHours();
}

/**
 * Numéro du jour LOCAL du patient (même numéro = même date du calendrier chez lui). Sert à compter les
 * jours avec et sans mesure : à Kinshasa, 23 h 30 et 0 h 30 le lendemain sont deux jours différents.
 */
export function localDayNumber(at: number, offsetMinutes: number): number {
  return Math.floor((at + offsetMinutes * MINUTE_MS) / DAY_MS);
}
