// Version web (aperçu dans le navigateur) : le localStorage suffit.
import { GLUCOSE_UNITS, type GlucoseUnit } from '@glyka/shared';

const KEY = 'glyka.unit';
export const DEFAULT_UNIT: GlucoseUnit = 'G_L';

export function parseUnit(raw: string | null): GlucoseUnit {
  return (GLUCOSE_UNITS as readonly string[]).includes(raw ?? '')
    ? (raw as GlucoseUnit)
    : DEFAULT_UNIT;
}

export function readUnit(): GlucoseUnit {
  try {
    return parseUnit(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return DEFAULT_UNIT;
  }
}

export function writeUnit(unit: GlucoseUnit): void {
  try {
    globalThis.localStorage?.setItem(KEY, unit);
  } catch {
    // navigation privée : sans gravité
  }
}
