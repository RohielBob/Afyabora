// Préférence d'apparence (logique pure, sans dépendance au téléphone : facile à tester).
import { ACCENT_NAMES, DEFAULT_ACCENT, type AccentName } from '@glyka/ui-tokens';

export type ThemePreference = 'light' | 'dark' | 'system';
export const DEFAULT_PREFERENCE: ThemePreference = 'light'; // décision ADR-0008 : blanc par défaut

export interface Appearance {
  preference: ThemePreference;
  accent: AccentName;
}

const PREFERENCES: readonly string[] = ['light', 'dark', 'system'];

/** Lit la préférence enregistrée ; toute valeur absente, illisible ou inconnue est remplacée par le défaut. */
export function parseAppearance(raw: string | null): Appearance {
  const fallback: Appearance = { preference: DEFAULT_PREFERENCE, accent: DEFAULT_ACCENT };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof Appearance, unknown>> | null;
    return {
      preference: PREFERENCES.includes(value?.preference as string)
        ? (value?.preference as ThemePreference)
        : fallback.preference,
      accent: (ACCENT_NAMES as readonly unknown[]).includes(value?.accent)
        ? (value?.accent as AccentName)
        : fallback.accent,
    };
  } catch {
    return fallback;
  }
}
