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
