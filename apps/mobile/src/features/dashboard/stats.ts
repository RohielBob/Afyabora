// Statistiques du tableau de bord (L2-07, CDC F3 et §5.2) : la LOGIQUE, sans interface (testée dans
// __tests__/stats.test.ts). Les CALCULS viennent du moteur déterministe @glyka/analytics (ADR-0005) ;
// ici on choisit les mesures de la période et de la période précédente, on applique la règle des
// 10 mesures (« Données insuffisantes ») et on prépare l'affichage (pourcentages, flèches ↑ ↓ →).
import { computeRangeStats, type RangeStats } from '@glyka/analytics';
import { MIN_MEASUREMENTS_FOR_ANALYSIS, type GlucoseThresholds } from '@glyka/shared';
import { periodBounds, pointsIn, type ChartPeriod, type ChartPoint } from './chart';

export interface PeriodStats {
  /** Nombre de mesures de la période (toujours connu, même s'il est insuffisant). */
  count: number;
  /** Statistiques de la période, ou null s'il y a moins de 10 mesures (CDC : pas de chiffre trompeur). */
  stats: RangeStats | null;
  /** Mêmes statistiques sur la période PRÉCÉDENTE de même durée, ou null si elle a moins de 10 mesures. */
  previous: RangeStats | null;
}

/** Ajoute des jours du calendrier (robuste aux changements d'heure). */
function addDays(time: number, days: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/**
 * Période précédente : les `days` jours juste avant le début de la période affichée
 * (« 30 derniers jours » ↔ « les 30 jours d'avant »). Fin exclue : aucune mesure comptée deux fois.
 */
export function previousBounds(days: ChartPeriod, now: Date): { from: number; to: number } {
  const current = periodBounds(days, now);
  return { from: addDays(current.from, -days), to: current.from - 1 };
}

const enough = (points: readonly ChartPoint[]) => points.length >= MIN_MEASUREMENTS_FOR_ANALYSIS;

export function periodStats(
  points: readonly ChartPoint[],
  days: ChartPeriod,
  now: Date,
  thresholds: GlucoseThresholds,
): PeriodStats {
  const current = pointsIn(points, periodBounds(days, now));
  const before = pointsIn(points, previousBounds(days, now));
  const toEngine = (list: readonly ChartPoint[]) =>
    list.map((p) => ({ id: p.id, at: p.at, mgDl: p.mgDl }));
  return {
    count: current.length,
    stats: enough(current) ? computeRangeStats(toEngine(current), thresholds) : null,
    previous: enough(before) ? computeRangeStats(toEngine(before), thresholds) : null,
  };
}

/**
 * Pourcentages entiers qui font TOUJOURS 100 : la règle vient du moteur (L3-04), pour que l'Accueil,
 * l'Analyse, l'API et le rapport affichent exactement le même chiffre.
 */
export { roundedPercents } from '@glyka/analytics';

export type Direction = 'up' | 'down' | 'flat';

/** Écart minimal pour parler de hausse ou de baisse (en dessous : « stable », flèche →). */
export const FLAT_TIME_IN_RANGE_POINTS = 5;
export const FLAT_MEAN_RATIO = 0.05;

export interface Change {
  direction: Direction;
  /** Écart signé : points de pourcentage pour le temps dans la cible, mg/dL pour la moyenne. */
  delta: number;
}

/** Temps dans la cible : écart en points de pourcentage (arrondis), « stable » sous 5 points. */
export function timeInRangeChange(current: RangeStats, previous: RangeStats): Change | null {
  if (current.timeInRangePct === null || previous.timeInRangePct === null) return null;
  const delta = Math.round(current.timeInRangePct - previous.timeInRangePct);
  return {
    direction: Math.abs(delta) < FLAT_TIME_IN_RANGE_POINTS ? 'flat' : delta > 0 ? 'up' : 'down',
    delta,
  };
}

/** Moyenne : écart en mg/dL (arrondi), « stable » sous 5 % de la moyenne précédente. */
export function meanChange(current: RangeStats, previous: RangeStats): Change | null {
  if (current.meanMgDl === null || previous.meanMgDl === null) return null;
  const delta = Math.round(current.meanMgDl - previous.meanMgDl);
  const flat = Math.abs(delta) < previous.meanMgDl * FLAT_MEAN_RATIO;
  return { direction: flat ? 'flat' : delta > 0 ? 'up' : 'down', delta };
}
