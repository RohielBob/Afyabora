// Apparence du portail (ADR-0008, comme Réglages → Apparence du mobile) : thème Clair (par défaut),
// Sombre ou Automatique (suit le réglage de l'ordinateur), et couleur d'accent parmi les thèmes préparés
// (Rubis, Framboise, Marine, Graphite).
//
// Ce fichier contient la LOGIQUE, testée sans navigateur (src/theme/__tests__/appearance.test.ts), et le
// petit « magasin » qui garde le choix pour tout le portail :
//  - le choix est gardé dans le `localStorage` du navigateur (clé `glyka.portal.appearance`) : c'est un
//    réglage d'affichage, sans aucune donnée patient, qui doit survivre à la déconnexion ;
//  - si le stockage est indisponible (navigation privée, stockage bloqué), le portail marche quand même :
//    le choix vaut alors pour l'onglet ouvert seulement.
import { ACCENT_NAMES, DEFAULT_ACCENT, type AccentName, type ColorMode } from '@glyka/ui-tokens';
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
/** Décision ADR-0008 : blanc par défaut, comme le mobile. */
export const DEFAULT_PREFERENCE: ThemePreference = 'light';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export interface Appearance {
  preference: ThemePreference;
  accent: AccentName;
}

export const DEFAULT_APPEARANCE: Appearance = {
  preference: DEFAULT_PREFERENCE,
  accent: DEFAULT_ACCENT,
};

export const STORAGE_KEY = 'glyka.portal.appearance';

/** Relit le choix enregistré ; absent, illisible ou inconnu ⇒ valeur par défaut (champ par champ). */
export function parseAppearance(raw: string | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof Appearance, unknown>> | null;
    return {
      preference: (THEME_PREFERENCES as readonly unknown[]).includes(value?.preference)
        ? (value?.preference as ThemePreference)
        : DEFAULT_PREFERENCE,
      accent: (ACCENT_NAMES as readonly unknown[]).includes(value?.accent)
        ? (value?.accent as AccentName)
        : DEFAULT_ACCENT,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Mode réellement affiché : « Automatique » prend celui de l'ordinateur. */
export function resolveMode(preference: ThemePreference, systemDark: boolean): ColorMode {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

// ---------- Magasin : le choix courant, partagé par tout le portail ----------

type Listener = () => void;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored(): Appearance {
  try {
    return parseAppearance(storage()?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let current: Appearance | null = null;
const listeners = new Set<Listener>();

/** Choix courant (lu une seule fois dans le stockage, puis gardé en mémoire). */
export function getAppearance(): Appearance {
  current ??= readStored();
  return current;
}

/** Change le choix, le garde dans le navigateur et prévient les abonnés (le thème se redessine). */
export function setAppearance(next: Partial<Appearance>): void {
  current = { ...getAppearance(), ...next };
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Stockage plein ou bloqué : le choix reste valable pour cet onglet.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeAppearance(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Choix courant pour un composant React (se met à jour quand il change). */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeAppearance, getAppearance, getAppearance);
}
