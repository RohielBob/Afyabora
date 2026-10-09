import { z } from 'zod';

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
