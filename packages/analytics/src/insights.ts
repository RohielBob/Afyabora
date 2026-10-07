// Orchestrateur : transforme des mesures en observations chiffrées et traçables.
// Règle : AUCUNE phrase ici. Le texte vient de templates.fr.ts (ou du LLM, reformulation seulement).
import {
  DEFAULT_THRESHOLDS,
  MIN_MEASUREMENTS_FOR_ANALYSIS,
  type GlucoseThresholds,
} from '@glyka/shared';
import { findAnomaliesBySlot, findHighStreaks, findLows } from './anomalies';
import { computeQuality } from './quality';
import { groupBySlot } from './slots';
import { computeRangeStats, inPeriod } from './stats';
import type { GlucosePoint, Insight, Period, QualityScore, RangeStats } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AnalysisResult {
  period: Period;
  quality: QualityScore;
  stats: RangeStats | null;
  previousStats: RangeStats | null;
  insights: Insight[];
}

export interface AnalyzeOptions {
  thresholds?: GlucoseThresholds;
  now: number;
  tzOffsetMinutes?: number;
}

export function analyze(
  allPoints: GlucosePoint[],
  period: Period,
  opts: AnalyzeOptions,
): AnalysisResult {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const tz = opts.tzOffsetMinutes ?? 60;
  const points = inPeriod(allPoints, period);
  const quality = computeQuality(allPoints, period, opts.now, tz);

  // Règle de blocage : pas d'analyse si les données sont insuffisantes.
  if (points.length < MIN_MEASUREMENTS_FOR_ANALYSIS) {
    return { period, quality, stats: null, previousStats: null, insights: [] };
  }

  const length = period.to - period.from;
  const previous = inPeriod(allPoints, { from: period.from - length, to: period.from });
  const stats = computeRangeStats(points, thresholds);
  const previousStats = previous.length > 0 ? computeRangeStats(previous, thresholds) : null;
  const insights: Insight[] = [];

  // Hypoglycémies répétées (≥ 2 sur 7 jours)
  const last7 = inPeriod(points, { from: period.to - 7 * DAY_MS, to: period.to });
  const lows = findLows(last7, thresholds.targetMinMgDl);
  if (lows.length >= 2) {
    insights.push({
      type: 'REPEATED_HYPO',
      severity: lows.some((p) => p.mgDl < thresholds.veryLowMgDl) ? 'ALERT' : 'ATTENTION',
      facts: { count: lows.length, thresholdMgDl: thresholds.targetMinMgDl, days: 7 },
      evidenceIds: lows.map((p) => p.id),
    });
  }

  // Séries de valeurs hautes (3 consécutives)
  for (const streak of findHighStreaks(points, thresholds.targetMaxMgDl, 3)) {
    insights.push({
      type: 'HIGH_STREAK',
      severity: 'ATTENTION',
      facts: { length: streak.length, thresholdMgDl: thresholds.targetMaxMgDl },
      evidenceIds: streak.map((p) => p.id),
    });
  }

  // Anomalies statistiques (z modifié > 3,5, calculé dans chaque créneau horaire)
  const anomalies = findAnomaliesBySlot(points, tz);
  if (anomalies.length > 0) {
    insights.push({
      type: 'ANOMALY',
      severity: 'ATTENTION',
      facts: { count: anomalies.length },
      evidenceIds: anomalies.map((p) => p.id),
    });
  }

  // Créneaux : au moins 5 mesures par créneau et écart notable (≥ 20 points de % vs. le global)
  const bySlot = groupBySlot(points, tz);
  const globalAbove = stats.timeAbovePct ?? 0;
  for (const [slot, pts] of Object.entries(bySlot)) {
    if (pts.length < 5) continue;
    const slotAbove = computeRangeStats(pts, thresholds).timeAbovePct ?? 0;
    if (slotAbove - globalAbove >= 20) {
      insights.push({
        type: 'TIME_OF_DAY_PATTERN',
        severity: 'INFO',
        facts: {
          slot,
          slotAbovePct: Math.round(slotAbove),
          globalAbovePct: Math.round(globalAbove),
        },
        evidenceIds: pts.filter((p) => p.mgDl > thresholds.targetMaxMgDl).map((p) => p.id),
      });
    }
  }

  // Données manquantes
  if (quality.daysWithData < quality.daysInPeriod) {
    insights.push({
      type: 'MISSING_DATA',
      severity: 'INFO',
      facts: {
        daysWithoutData: quality.daysInPeriod - quality.daysWithData,
        daysInPeriod: quality.daysInPeriod,
      },
      evidenceIds: [],
    });
  }

  // Comparaison avec la période précédente
  if (previousStats?.timeInRangePct != null && stats.timeInRangePct != null) {
    insights.push({
      type: 'PERIOD_COMPARISON',
      severity: 'INFO',
      facts: {
        timeInRangePct: Math.round(stats.timeInRangePct),
        previousTimeInRangePct: Math.round(previousStats.timeInRangePct),
      },
      evidenceIds: [],
    });
  }

  return { period, quality, stats, previousStats, insights };
}
