// Version web (aperçu de développement dans le navigateur, sans SQLite) : le localStorage suffit.
import type { GlucoseThresholds } from '@glyka/shared';
import { THRESHOLDS_KEY, parseStoredThresholds } from './stored-thresholds';

export async function readThresholds(): Promise<GlucoseThresholds> {
  try {
    return parseStoredThresholds(globalThis.localStorage?.getItem(THRESHOLDS_KEY) ?? null);
  } catch {
    return parseStoredThresholds(null);
  }
}

export async function saveThresholds(thresholds: GlucoseThresholds): Promise<void> {
  try {
    globalThis.localStorage?.setItem(THRESHOLDS_KEY, JSON.stringify(thresholds));
  } catch {
    // navigation privée : sans gravité
  }
}
