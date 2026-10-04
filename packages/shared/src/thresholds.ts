// Seuils par défaut — À FAIRE VALIDER par un professionnel de santé (cahier des charges §5.4).
import type { GlucoseState } from './enums';

export interface GlucoseThresholds {
  /** Très bas : en dessous → état VERY_LOW (mg/dL) */
  veryLowMgDl: number;
  /** Début de la plage cible (mg/dL), en dessous → LOW */
  targetMinMgDl: number;
  /** Fin de la plage cible (mg/dL), au-dessus → HIGH */
  targetMaxMgDl: number;
  /** Très haut : au-dessus → VERY_HIGH (mg/dL) */
  veryHighMgDl: number;
}

export const DEFAULT_THRESHOLDS: GlucoseThresholds = {
  veryLowMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  veryHighMgDl: 250,
};

export function classifyGlucose(mgDl: number, t: GlucoseThresholds = DEFAULT_THRESHOLDS): GlucoseState {
  if (mgDl < t.veryLowMgDl) return 'VERY_LOW';
  if (mgDl < t.targetMinMgDl) return 'LOW';
  if (mgDl > t.veryHighMgDl) return 'VERY_HIGH';
  if (mgDl > t.targetMaxMgDl) return 'HIGH';
  return 'IN_RANGE';
}

/** Forme + libellé associés à chaque état : l'état n'est jamais exprimé par la couleur seule. */
export const STATE_SYMBOLS: Record<GlucoseState, { symbol: string; label: string }> = {
  VERY_LOW: { symbol: '▼▼', label: 'Très bas' },
  LOW: { symbol: '▼', label: 'En dessous' },
  IN_RANGE: { symbol: '●', label: 'Dans la plage' },
  HIGH: { symbol: '▲', label: 'Au-dessus' },
  VERY_HIGH: { symbol: '▲▲', label: 'Très haut' },
};
