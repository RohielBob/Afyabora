// Détection d'anomalies : score z modifié (médiane + MAD), seuil 3,5 (Iglewicz & Hoaglin).
import { groupBySlot } from './slots';
import { median } from './stats';
import type { PatientTimeZone } from './timezone';
import type { GlucosePoint } from './types';

export const MODIFIED_Z_THRESHOLD = 3.5;

export function mad(values: number[]): number | null {
  const med = median(values);
  if (med === null) return null;
  return median(values.map((v) => Math.abs(v - med)));
}

export function modifiedZScores(points: GlucosePoint[]): Map<string, number> {
  const values = points.map((p) => p.mgDl);
  const med = median(values);
  const m = mad(values);
  const out = new Map<string, number>();
  if (med === null || m === null || m === 0) return out; // MAD nul : pas de score fiable
  for (const p of points) out.set(p.id, (0.6745 * (p.mgDl - med)) / m);
  return out;
}

export function findStatisticalAnomalies(points: GlucosePoint[]): GlucosePoint[] {
  const scores = modifiedZScores(points);
  return points.filter((p) => Math.abs(scores.get(p.id) ?? 0) > MODIFIED_Z_THRESHOLD);
}

/** `minLength` mesures consécutives (triées par date) au-dessus de `thresholdMgDl`. */
export function findHighStreaks(
  points: GlucosePoint[],
  thresholdMgDl: number,
  minLength = 3,
): GlucosePoint[][] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const streaks: GlucosePoint[][] = [];
  let current: GlucosePoint[] = [];
  for (const p of sorted) {
    if (p.mgDl > thresholdMgDl) current.push(p);
    else {
      if (current.length >= minLength) streaks.push(current);
      current = [];
    }
  }
  if (current.length >= minLength) streaks.push(current);
  return streaks;
}

/** Mesures sous `thresholdMgDl` dans la fenêtre ; à partir de 2 → « hypoglycémies répétées ». */
export function findLows(points: GlucosePoint[], thresholdMgDl: number): GlucosePoint[] {
  return points.filter((p) => p.mgDl < thresholdMgDl);
}

/** Minimum de mesures dans un créneau pour y calculer un score fiable. */
export const MIN_POINTS_PER_SLOT_FOR_ANOMALY = 8;

/**
 * Anomalies calculées PAR CRÉNEAU HORAIRE : une habitude régulière (ex. valeurs hautes chaque soir)
 * n'est pas une anomalie, elle est signalée comme « tendance par créneau » (insights.ts).
 */
export function findAnomaliesBySlot(
  points: GlucosePoint[],
  timeZone?: PatientTimeZone,
): GlucosePoint[] {
  const out: GlucosePoint[] = [];
  for (const slotPoints of Object.values(groupBySlot(points, timeZone))) {
    if (slotPoints.length < MIN_POINTS_PER_SLOT_FOR_ANOMALY) continue;
    out.push(...findStatisticalAnomalies(slotPoints));
  }
  return out;
}
