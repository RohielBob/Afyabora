// Tableau de bord (L2-05) : la LOGIQUE d'affichage de la dernière mesure, sans interface (testée dans
// __tests__/latest.test.ts). Les textes viennent des clés i18n `dashboard.*` ; ici on ne fait que choisir
// la bonne clé et les bons nombres.

/** Jour de la mesure par rapport à aujourd'hui (jours du CALENDRIER local, pas des tranches de 24 h). */
export type DayLabel = 'today' | 'yesterday' | 'earlier';

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Différence en jours de calendrier (0 = même jour). Arrondie : robuste aux changements d'heure. */
function calendarDaysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

export function dayLabel(date: Date, now: Date): DayLabel {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return 'earlier';
}

/** Ancienneté de la mesure, en clair : « à l'instant », « il y a 12 min », « il y a 3 h », « il y a 2 jours ». */
export type Age =
  | { key: 'justNow' }
  | { key: 'minutes'; count: number }
  | { key: 'hours'; count: number }
  | { key: 'days'; count: number };

export function ageOf(date: Date, now: Date): Age {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  // Moins d'une minute, ou un peu dans le futur (horloge du téléphone en avance, tolérée à la saisie).
  if (minutes < 1) return { key: 'justNow' };
  if (minutes < 60) return { key: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'hours', count: hours };
  // Au-delà : en jours de calendrier, comme « hier » (mesurée hier à 23 h, vue à 8 h = « il y a 1 jour »).
  return { key: 'days', count: Math.max(1, calendarDaysBetween(date, now)) };
}

/** Salutation du titre : « Bonjour » le jour, « Bonsoir » à partir de 18 h et la nuit. */
export function greetingKey(now: Date): 'morning' | 'evening' {
  const hour = now.getHours();
  return hour >= 18 || hour < 5 ? 'evening' : 'morning';
}
