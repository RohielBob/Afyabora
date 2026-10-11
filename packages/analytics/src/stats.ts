import { classifyGlucose, DEFAULT_THRESHOLDS, type GlucoseThresholds } from '@glyka/shared';
import type { GlucosePoint, Period, RangeStats } from './types';

export function inPeriod(points: GlucosePoint[], period: Period): GlucosePoint[] {
  return points.filter((p) => p.at >= period.from && p.at < period.to);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Écart-type d'échantillon (n-1). */
export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? ((s[mid - 1] as number) + (s[mid] as number)) / 2
    : (s[mid] as number);
}

const pct = (n: number, total: number) => (total === 0 ? null : (n / total) * 100);

/**
 * Reste après la virgule, arrondi à 9 décimales : 58,333… − 58 et 8,333… − 8 sont alors bien ÉGAUX.
 * Sans cela, l'imprécision du calcul en machine décidait quelle part recevait le point manquant.
 */
const restOf = (value: number) => Math.round((value - Math.floor(value)) * 1e9) / 1e9;

/**
 * Pourcentages entiers qui font TOUJOURS 100 (méthode du plus grand reste) : 33,3 / 33,3 / 33,3 donne
 * 34 / 33 / 33 et non 33 / 33 / 33 (= 99 %, que l'œil remarque). Les valeurs données font 100 au total.
 * À reste égal, le point va à la plus grande part (puis à la première) : règle fixe, jamais le hasard.
 */
export function roundedPercents(values: readonly number[]): number[] {
  const floors = values.map((v) => Math.floor(v));
  let missing = 100 - floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, v, rest: restOf(v) }))
    .sort((a, b) => b.rest - a.rest || b.v - a.v || a.i - b.i);
  for (const { i } of order) {
    if (missing <= 0) break;
    floors[i] = (floors[i] as number) + 1;
    missing -= 1;
  }
  return floors;
}

/** Répartition affichée : en dessous / dans la plage / au-dessus, en entiers qui font 100. */
export interface DisplayPercents {
  below: number;
  inRange: number;
  above: number;
}

/**
 * LA répartition à afficher partout (L3-04) : écrans du téléphone, phrases du moteur, API, rapport. Un
 * même historique donne ainsi le même chiffre sur l'Accueil, dans l'Analyse et chez le médecin.
 * null si aucune mesure.
 */
export function displayPercents(stats: RangeStats): DisplayPercents | null {
  if (stats.timeInRangePct === null || stats.timeBelowPct === null || stats.timeAbovePct === null) {
    return null;
  }
  const [below, inRange, above] = roundedPercents([
    stats.timeBelowPct,
    stats.timeInRangePct,
    stats.timeAbovePct,
  ]) as [number, number, number];
  return { below, inRange, above };
}

export function computeRangeStats(
  points: GlucosePoint[],
  thresholds: GlucoseThresholds = DEFAULT_THRESHOLDS,
): RangeStats {
  const values = points.map((p) => p.mgDl);
  const m = mean(values);
  const sd = standardDeviation(values);
  let below = 0;
  let above = 0;
  let inRange = 0;
  for (const p of points) {
    const s = classifyGlucose(p.mgDl, thresholds);
    if (s === 'LOW' || s === 'VERY_LOW') below++;
    else if (s === 'HIGH' || s === 'VERY_HIGH') above++;
    else inRange++;
  }
  return {
    count: points.length,
    meanMgDl: m,
    sdMgDl: sd,
    cvPercent: m && sd !== null ? (sd / m) * 100 : null,
    timeInRangePct: pct(inRange, points.length),
    timeAbovePct: pct(above, points.length),
    timeBelowPct: pct(below, points.length),
  };
}
