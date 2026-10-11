// Score de qualité des données (cahier des charges §5.3).
// Score = 0,5 × Couverture + 0,3 × Densité + 0,2 × Fraîcheur
import {
  MIN_MEASUREMENTS_FOR_ANALYSIS,
  QUALITY_TARGET_MEASUREMENTS_PER_DAY,
  type QualityLevel,
} from '@glyka/shared';
import { localDayNumber, resolveTimeZone, type PatientTimeZone } from './timezone';
import type { GlucosePoint, Period, QualityScore } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function qualityLevel(score: number): QualityLevel {
  if (score >= 75) return 'GOOD';
  if (score >= 40) return 'PARTIAL';
  return 'INSUFFICIENT';
}

export function computeQuality(
  allPoints: GlucosePoint[],
  period: Period,
  now: number,
  timeZone?: PatientTimeZone, // par défaut Kinshasa, UTC+1 (timezone.ts)
): QualityScore {
  // Les jours se comptent à la date du calendrier du PATIENT (L3-02), heure d'été comprise.
  const offsetAt = resolveTimeZone(timeZone);
  const points = allPoints.filter((p) => p.at >= period.from && p.at < period.to);
  const daysInPeriod = Math.max(1, Math.round((period.to - period.from) / DAY_MS));

  const perDay = new Map<number, number>();
  for (const p of points) {
    const k = localDayNumber(p.at, offsetAt(p.at));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const daysWithData = perDay.size;

  const coverage = Math.min(1, daysWithData / daysInPeriod);
  const avgPerCoveredDay = daysWithData === 0 ? 0 : points.length / daysWithData;
  const density = Math.min(1, avgPerCoveredDay / QUALITY_TARGET_MEASUREMENTS_PER_DAY);

  const lastAt = allPoints.reduce((max, p) => (p.at <= now && p.at > max ? p.at : max), -Infinity);
  const daysSinceLast = lastAt === -Infinity ? Infinity : (now - lastAt) / DAY_MS;
  const freshness = daysSinceLast <= 1 ? 1 : daysSinceLast >= 7 ? 0 : 1 - (daysSinceLast - 1) / 6;

  const score = Math.round((0.5 * coverage + 0.3 * density + 0.2 * freshness) * 100);

  return {
    score,
    level: qualityLevel(score),
    coverage: Math.round(coverage * 100),
    density: Math.round(density * 100),
    freshness: Math.round(freshness * 100),
    analyzable: points.length >= MIN_MEASUREMENTS_FOR_ANALYSIS,
    daysInPeriod,
    daysWithData,
  };
}
