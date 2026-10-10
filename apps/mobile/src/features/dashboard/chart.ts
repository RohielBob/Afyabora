// Graphique d'évolution (L2-06, CDC F3) : la LOGIQUE, sans dessin (testée dans __tests__/chart.test.ts).
//  - périodes 7 / 14 / 30 / 90 jours, en jours du calendrier (aujourd'hui compris) ;
//  - échelle verticale « ronde » DANS L'UNITÉ du patient (0,50 · 1,00 · 1,50 g/L plutôt que 0,48…) ;
//  - graduations du temps (chaque jour, tous les 2 jours, chaque semaine, tous les 30 jours) ;
//  - courbe coupée quand il manque des mesures trop longtemps (on ne dessine pas une tendance inventée) ;
//  - mesure la plus proche du doigt (sélection au toucher).
import type { GlucoseThresholds, GlucoseUnit, MeasurementContext } from '@glyka/shared';
import { MG_DL_PER_G_L, MG_DL_PER_MMOL_L } from '@glyka/shared';
import { DECIMALS, FUTURE_TOLERANCE_MS } from '@/features/measurements';

export const CHART_PERIODS = [7, 14, 30, 90] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
/** Période affichée à l'ouverture : celle du scénario de démo (« graphique 30 jours »). */
export const DEFAULT_PERIOD: ChartPeriod = 30;

export interface ChartPoint {
  id: string;
  /** Instant de la mesure (ms depuis epoch). */
  at: number;
  mgDl: number;
  context: MeasurementContext;
}

const DAY_MS = 86_400_000;

function localMidnight(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Ajoute des jours du calendrier (robuste aux changements d'heure, contrairement à + n × 24 h). */
function addDays(time: number, days: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/**
 * Bornes de la période : du début du jour il y a (jours − 1) jusqu'à maintenant (+ la tolérance de saisie,
 * pour garder une mesure notée avec une horloge un peu en avance). « 7 jours » = aujourd'hui + 6 jours.
 */
export function periodBounds(days: ChartPeriod, now: Date): { from: number; to: number } {
  return {
    from: addDays(localMidnight(now.getTime()), -(days - 1)),
    to: now.getTime() + FUTURE_TOLERANCE_MS,
  };
}

/** Points de la période, du plus ancien au plus récent. */
export function pointsIn(points: readonly ChartPoint[], bounds: { from: number; to: number }) {
  return points.filter((p) => p.at >= bounds.from && p.at <= bounds.to).sort((a, b) => a.at - b.at);
}

/** Pas « rond » (1, 2, 2,5 ou 5 × 10ⁿ) proche de `raw` : graduations lisibles. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

const MG_DL_PER_UNIT: Record<GlucoseUnit, number> = {
  G_L: MG_DL_PER_G_L,
  MMOL_L: MG_DL_PER_MMOL_L,
  MG_DL: 1,
};

export interface YScale {
  /** Bas et haut de l'axe, en mg/dL. */
  minMgDl: number;
  maxMgDl: number;
  /** Graduations : position (mg/dL) et texte dans l'unité du patient (« 1,50 »). */
  ticks: { mgDl: number; label: string }[];
}

/**
 * Axe vertical : contient toujours la plage cible (pour voir la bande) et toutes les mesures, avec une
 * petite marge, puis arrondi à des graduations rondes dans l'unité choisie (environ 4 intervalles).
 */
export function yScale(
  values: readonly number[],
  thresholds: GlucoseThresholds,
  unit: GlucoseUnit,
): YScale {
  const factor = MG_DL_PER_UNIT[unit];
  const low = Math.min(thresholds.targetMinMgDl, ...values);
  const high = Math.max(thresholds.targetMaxMgDl, ...values);
  const margin = Math.max(10, (high - low) * 0.08);
  const lowU = Math.max(0, low - margin) / factor;
  const highU = (high + margin) / factor;
  const step = niceStep((highU - lowU) / 4);
  const start = Math.floor(lowU / step + 1e-9) * step;
  const end = Math.ceil(highU / step - 1e-9) * step;
  // Mêmes décimales que partout dans l'app (g/L : 2, mmol/L : 1, mg/dL : 0).
  const digits = DECIMALS[unit];
  const ticks: YScale['ticks'] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push({ mgDl: v * factor, label: v.toFixed(digits).replace('.', ',') });
  }
  return { minMgDl: start * factor, maxMgDl: end * factor, ticks };
}

/** Écart entre deux graduations du temps, en jours, selon la période (4 à 7 étiquettes). */
export function tickStepDays(days: ChartPeriod): number {
  if (days <= 7) return 1;
  if (days <= 14) return 2;
  if (days <= 30) return 7;
  return 30; // 90 jours : 4 repères, sinon les dates se chevauchent sur un téléphone
}

/** Graduations du temps : minuits locaux, en partant du jour le plus récent (aujourd'hui toujours marqué). */
export function xTicks(days: ChartPeriod, bounds: { from: number; to: number }): number[] {
  const step = tickStepDays(days);
  const ticks: number[] = [];
  for (
    let t = localMidnight(bounds.to - FUTURE_TOLERANCE_MS);
    t >= bounds.from;
    t = addDays(t, -step)
  ) {
    ticks.unshift(t);
  }
  return ticks;
}

/** Au-delà de cet écart sans mesure, la courbe est coupée (les points restent). */
export const MAX_GAP_MS = 2 * DAY_MS;

/** Au-delà de ce nombre de mesures affichées, points et courbe s'affinent (sinon ils forment un amas). */
export const DENSE_POINTS = 120;

/** Morceaux de courbe : une nouvelle ligne commence après un trou de plus de 2 jours. */
export function segments(points: readonly ChartPoint[], maxGap = MAX_GAP_MS): ChartPoint[][] {
  const result: ChartPoint[][] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    const previous = last?.[last.length - 1];
    if (last && previous && p.at - previous.at <= maxGap) last.push(p);
    else result.push([p]);
  }
  return result;
}

/** Indice de la valeur de `sorted` (croissant) la plus proche de `x` ; -1 si la liste est vide. */
export function nearestIndex(sorted: readonly number[], x: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && x - (sorted[lo - 1] as number) <= (sorted[lo] as number) - x) return lo - 1;
  return lo;
}

/** Tracé SVG d'une ligne brisée (« M x y L x y … ») et sa longueur (pour l'animation de dessin). */
export function polyline(coords: readonly { x: number; y: number }[]): {
  d: string;
  length: number;
} {
  let d = '';
  let length = 0;
  coords.forEach((c, i) => {
    d += `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
    if (i > 0) {
      const prev = coords[i - 1] as { x: number; y: number };
      length += Math.hypot(c.x - prev.x, c.y - prev.y);
    }
  });
  return { d, length };
}
