// Conversion et formatage de la glycémie.
// Règle (ADR-0002) : tout est STOCKÉ en mg/dL entier. 1,48 g/L = 148 mg/dL exactement.
import type { GlucoseUnit } from './enums';

export const MG_DL_PER_G_L = 100;
/** 1 mmol/L de glucose ≈ 18,016 mg/dL. */
export const MG_DL_PER_MMOL_L = 18.016;

/** Bornes plausibles (en mg/dL) pour un lecteur de glycémie courant. */
export const PLAUSIBLE_MIN_MG_DL = 20;
export const PLAUSIBLE_MAX_MG_DL = 600;

/**
 * Arrondi à l'entier le plus proche (moitié vers le haut), SANS l'erreur des nombres à virgule de
 * l'ordinateur : 1,005 × 100 vaut 100,49999999999999 en machine, et Math.round donnait 100 au lieu de 101
 * (36 des 600 valeurs « x,xx5 g/L » étaient mal arrondies, L2-12). On ramène d'abord le produit à
 * 12 chiffres significatifs (100,500000000), ce qui efface cette erreur minuscule, puis on arrondit.
 */
function roundHalfUp(product: number): number {
  return Math.round(Number(product.toPrecision(12)));
}

export function toMgDl(value: number, unit: GlucoseUnit): number {
  switch (unit) {
    case 'G_L':
      return roundHalfUp(value * MG_DL_PER_G_L);
    case 'MMOL_L':
      return roundHalfUp(value * MG_DL_PER_MMOL_L);
    case 'MG_DL':
      return roundHalfUp(value);
  }
}

export function fromMgDl(mgDl: number, unit: GlucoseUnit): number {
  switch (unit) {
    case 'G_L':
      return Math.round(mgDl) / MG_DL_PER_G_L;
    case 'MMOL_L':
      return Math.round((mgDl / MG_DL_PER_MMOL_L) * 10) / 10;
    case 'MG_DL':
      return Math.round(mgDl);
  }
}

export function isPlausibleMgDl(mgDl: number): boolean {
  return Number.isFinite(mgDl) && mgDl >= PLAUSIBLE_MIN_MG_DL && mgDl <= PLAUSIBLE_MAX_MG_DL;
}

/** Une valeur saisie dans une unité donnée est-elle plausible ? (ex. 18,7 g/L → non) */
export function isPlausible(value: number, unit: GlucoseUnit): boolean {
  return isPlausibleMgDl(toMgDl(value, unit));
}

export const UNIT_LABELS: Record<GlucoseUnit, string> = {
  G_L: 'g/L',
  MG_DL: 'mg/dL',
  MMOL_L: 'mmol/L',
};

/** Formate pour l'affichage en français : virgule décimale + unité. */
export function formatGlucose(mgDl: number, unit: GlucoseUnit, withUnit = true): string {
  const v = fromMgDl(mgDl, unit);
  const digits = unit === 'G_L' ? 2 : unit === 'MMOL_L' ? 1 : 0;
  const text = v.toFixed(digits).replace('.', ',');
  return withUnit ? `${text} ${UNIT_LABELS[unit]}` : text;
}

/** Lit un nombre saisi avec virgule ou point décimal. Retourne null si illisible. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
