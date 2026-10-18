import { z } from 'zod';
import { INSIGHT_SEVERITIES, INSIGHT_TYPES, QUALITY_LEVELS } from '../enums';

/** Périodes proposées par le tableau de bord et l'analyse (en jours). */
export const PERIOD_DAYS = [7, 14, 30, 90] as const;
/** Périodes proposées pour le rapport « Préparer ma consultation ». */
export const REPORT_PERIOD_DAYS = [14, 30, 90] as const;

const periodOf = (allowed: readonly number[]) =>
  z.coerce
    .number()
    .int()
    .refine((days) => allowed.includes(days), {
      message: `La période doit être l'une de : ${allowed.join(', ')} jours`,
    });

/** GET /insights?period=30 et GET /quality?period=30 */
export const insightsQuerySchema = z.object({ period: periodOf(PERIOD_DAYS).default(30) });

/** GET /reports/consultation?period=30 */
export const reportQuerySchema = z.object({ period: periodOf(REPORT_PERIOD_DAYS).default(30) });

/** POST /insights/ask (P1) : question libre sur son historique. */
export const askInsightSchema = z.object({
  question: z.string().trim().min(3).max(500),
  period: periodOf(PERIOD_DAYS).default(30),
});
export type AskInsightInput = z.infer<typeof askInsightSchema>;

// ---------- Résultats de l'analyse (contrat : QualityScore, RangeStats, Insight) ----------
// Calculés par @glyka/analytics ; ces schémas servent à VÉRIFIER une réponse (portail du médecin, L5-12).

const percent = z.number().int().min(0).max(100);

/** Qualité des données : couverture, densité, fraîcheur ; `analyzable` faux sous 10 mesures. */
export const qualityScoreSchema = z.object({
  score: percent,
  level: z.enum(QUALITY_LEVELS),
  coverage: percent,
  density: percent,
  freshness: percent,
  analyzable: z.boolean(),
  daysInPeriod: z.number().int(),
  daysWithData: z.number().int(),
});
export type QualityScoreDto = z.infer<typeof qualityScoreSchema>;

/** Statistiques de la période (mg/dL et pourcentages) ; null quand il n'y a aucune mesure. */
export const rangeStatsSchema = z.object({
  count: z.number().int(),
  meanMgDl: z.number().nullable(),
  sdMgDl: z.number().nullable(),
  cvPercent: z.number().nullable(),
  timeInRangePct: z.number().nullable(),
  timeAbovePct: z.number().nullable(),
  timeBelowPct: z.number().nullable(),
});
export type RangeStatsDto = z.infer<typeof rangeStatsSchema>;

/** Une observation du moteur, avec ses preuves et sa phrase (jamais un diagnostic). */
export const insightSchema = z.object({
  type: z.enum(INSIGHT_TYPES),
  severity: z.enum(INSIGHT_SEVERITIES),
  facts: z.record(z.union([z.number(), z.string()])),
  evidenceIds: z.array(z.string()),
  text: z.string(),
});
export type InsightDto = z.infer<typeof insightSchema>;
