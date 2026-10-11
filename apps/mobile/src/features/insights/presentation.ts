// Écran « Analyse » (L3-04, CDC F6) : la LOGIQUE d'affichage, sans interface (testée dans
// __tests__/presentation.test.ts). Les observations et leurs chiffres viennent du moteur (L8-11) ; ici on
// les ORDONNE, on choisit le résumé du haut de l'écran, on retrouve les mesures qui justifient chaque
// observation (« Voir les mesures concernées ») et on met la phrase en mots.
import type { InsightWithText, LastDaysAnalysis } from '@glyka/analytics';
import { MIN_MEASUREMENTS_FOR_ANALYSIS, type InsightSeverity } from '@glyka/shared';
import type { MeasurementPoint } from '@/features/measurements';

/** Ordre d'affichage : alertes d'abord, puis « à surveiller », puis les simples informations. */
const SEVERITY_RANK: Record<InsightSeverity, number> = { ALERT: 0, ATTENTION: 1, INFO: 2 };

/** Observations triées par gravité ; à gravité égale, l'ordre du moteur est gardé (tri stable). */
export function orderInsights(insights: readonly InsightWithText[]): InsightWithText[] {
  return insights
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] || a.index - b.index,
    )
    .map(({ insight }) => insight);
}

/** Mesures de la période analysée (début inclus, fin exclue). */
export function pointsInPeriod(
  points: readonly MeasurementPoint[],
  period: LastDaysAnalysis['period'],
): MeasurementPoint[] {
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  return points.filter((p) => p.at >= from && p.at < to);
}

/** Ce que dit le haut de l'écran. */
export type Headline =
  /** Moins de 10 mesures : pas d'analyse (CDC §5.3) ; on dit combien il en manque. */
  | { kind: 'insufficient'; count: number; missing: number }
  /** Analyse faite, rien qui demande l'attention (au plus des informations). */
  | { kind: 'calm'; observations: number }
  /** Analyse faite, `watch` observations « à surveiller » ou « alerte ». */
  | { kind: 'watch'; observations: number; watch: number };

export function headlineOf(
  analysis: LastDaysAnalysis,
  points: readonly MeasurementPoint[],
): Headline {
  if (analysis.stats === null) {
    const count = pointsInPeriod(points, analysis.period).length;
    return {
      kind: 'insufficient',
      count,
      missing: Math.max(0, MIN_MEASUREMENTS_FOR_ANALYSIS - count),
    };
  }
  const observations = analysis.insights.length;
  const watch = analysis.insights.filter((i) => i.severity !== 'INFO').length;
  return watch === 0 ? { kind: 'calm', observations } : { kind: 'watch', observations, watch };
}

/** Nombre de mesures concernées montrées d'abord ; les autres derrière « Afficher N autres ». */
export const EVIDENCE_PREVIEW = 5;

/**
 * Mesures qui justifient l'observation, de la plus RÉCENTE à la plus ancienne (comme la chronologie).
 * Une preuve absente des mesures lues (supprimée entre-temps) est simplement ignorée.
 */
export function evidenceOf(
  insight: InsightWithText,
  points: readonly MeasurementPoint[],
): MeasurementPoint[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  return insight.evidenceIds
    .map((id) => byId.get(id))
    .filter((p): p is MeasurementPoint => p !== undefined)
    .sort((a, b) => b.at - a.at);
}

/**
 * Seuil franchi, à rappeler sous une observation (CDC F6 : « alerte = observation + seuil franchi +
 * rappel de consulter »). `below` : mesures SOUS le seuil bas ; `above` : AU-DESSUS du seuil haut.
 */
export function crossedThreshold(
  insight: InsightWithText,
): { direction: 'below' | 'above'; mgDl: number } | null {
  const mgDl = insight.facts.thresholdMgDl;
  if (typeof mgDl !== 'number') return null;
  if (insight.type === 'REPEATED_HYPO') return { direction: 'below', mgDl };
  if (insight.type === 'HIGH_STREAK') return { direction: 'above', mgDl };
  return null;
}

/** Traduction minimale dont la phrase a besoin (i18next `t`). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Phrase de l'observation, par les traductions (`insights.sentence.*`) à partir des FAITS du moteur.
 * En français, elle est mot pour mot celle des gabarits du moteur (`renderInsightFr`, la même que l'API) :
 * un test le vérifie pour chaque type d'observation.
 */
export function insightSentence(t: Translate, insight: InsightWithText): string {
  const facts = insight.facts;
  if (insight.type === 'TIME_OF_DAY_PATTERN') {
    return t('insights.sentence.TIME_OF_DAY_PATTERN', {
      ...facts,
      slot: t(`insights.slot.${String(facts.slot)}`),
    });
  }
  return t(`insights.sentence.${insight.type}`, facts);
}
