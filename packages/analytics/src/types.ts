import type { GlucoseState, InsightSeverity, InsightType, QualityLevel } from '@glyka/shared';

/** Point de mesure minimal. Le moteur ne connaît ni la base de données ni le réseau. */
export interface GlucosePoint {
  id: string;
  /** Instant de la mesure, en millisecondes depuis epoch (UTC). */
  at: number;
  mgDl: number;
}

export interface Period {
  /** Début inclus (ms epoch) */
  from: number;
  /** Fin exclue (ms epoch) */
  to: number;
}

export interface RangeStats {
  count: number;
  meanMgDl: number | null;
  sdMgDl: number | null;
  /** Coefficient de variation en % */
  cvPercent: number | null;
  /** Pourcentages (0–100) ; null si aucune mesure */
  timeInRangePct: number | null;
  timeAbovePct: number | null;
  timeBelowPct: number | null;
}

export interface QualityScore {
  score: number; // 0–100
  level: QualityLevel;
  coverage: number; // 0–100
  density: number; // 0–100
  freshness: number; // 0–100
  /** false si moins de MIN_MEASUREMENTS_FOR_ANALYSIS mesures : pas d'analyse */
  analyzable: boolean;
  daysInPeriod: number;
  daysWithData: number;
}

export interface Insight {
  type: InsightType;
  severity: InsightSeverity;
  /** Faits chiffrés, sans phrase : c'est le texte (gabarit ou LLM) qui les met en mots. */
  facts: Record<string, number | string>;
  /** Mesures qui justifient l'observation (« Voir les mesures concernées »). */
  evidenceIds: string[];
}

export interface StateCount {
  state: GlucoseState;
  count: number;
}
