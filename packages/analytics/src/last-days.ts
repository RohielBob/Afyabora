// Analyse des « N derniers jours » du patient, prête à afficher (L8-11). Une SEULE fonction pour l'API
// (GET /insights) et pour le téléphone (hors-ligne, base locale) : les deux montrent exactement les mêmes
// chiffres, les mêmes observations et les mêmes phrases.
import { DEFAULT_THRESHOLDS, type GlucoseThresholds } from '@glyka/shared';
import { analyze } from './insights';
import { renderSummaryFr, summaryFacts } from './summary';
import { DISCLAIMER_FR, renderInsightFr } from './templates.fr';
import { lastDaysPeriod, type PatientTimeZone } from './timezone';
import type { GlucosePoint, Insight, QualityScore, RangeStats } from './types';

/** Observation avec sa phrase en français (gabarit ; un modèle de langage pourra la reformuler). */
export type InsightWithText = Insight & { text: string };

/** Même forme que la réponse de GET /insights (schéma `InsightsResponse` du contrat). */
export interface LastDaysAnalysis {
  /** Période analysée, en UTC : de minuit il y a N − 1 jours à minuit ce soir (exclu). */
  period: { from: string; to: string };
  quality: QualityScore;
  /** null sous 10 mesures (« Données insuffisantes »). */
  stats: RangeStats | null;
  previousStats: RangeStats | null;
  insights: InsightWithText[];
  /** Résumé de la période en langage clair (L3-06) : gabarit du moteur, éventuellement reformulé par l'API. */
  summary: string;
  /** « Ces observations sont statistiques… pas un diagnostic. » */
  disclaimer: string;
}

export interface LastDaysOptions {
  now: number;
  thresholds?: GlucoseThresholds;
  timeZone?: PatientTimeZone;
}

/**
 * Mesures à lire pour analyser les `days` derniers jours : la période ET la période précédente de même
 * durée (comparaison). La fraîcheur n'a besoin que des 7 derniers jours, déjà compris.
 * `from` inclus, `to` exclu.
 */
export function analysisWindow(
  days: number,
  now: number,
  timeZone?: PatientTimeZone,
): { from: number; to: number } {
  const period = lastDaysPeriod(days, now, timeZone);
  return { from: period.from - (period.to - period.from), to: period.to };
}

/** Analyse complète des `days` derniers jours entiers du patient, avec les phrases et l'avertissement. */
export function analyzeLastDays(
  points: GlucosePoint[],
  days: number,
  opts: LastDaysOptions,
): LastDaysAnalysis {
  const period = lastDaysPeriod(days, opts.now, opts.timeZone);
  const result = analyze(points, period, {
    now: opts.now,
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
    timeZone: opts.timeZone,
  });
  return {
    period: { from: new Date(period.from).toISOString(), to: new Date(period.to).toISOString() },
    quality: result.quality,
    stats: result.stats,
    previousStats: result.previousStats,
    insights: result.insights.map((insight) => ({ ...insight, text: renderInsightFr(insight) })),
    summary: renderSummaryFr(summaryFacts(result, days)),
    disclaimer: DISCLAIMER_FR,
  };
}
