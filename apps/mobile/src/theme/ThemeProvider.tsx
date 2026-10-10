// Fournisseur de thème (L7-03, ADR-0008) : clair (par défaut), sombre ou automatique (comme le téléphone),
// et une couleur d'accent préparée (Rubis par défaut). Le choix est mémorisé sur le téléphone.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type AccentName, type Theme } from '@glyka/ui-tokens';
import { parseAppearance, type Appearance, type ThemePreference } from './appearance';
import { readAppearance, writeAppearance } from './appearance-storage';

interface ThemeContextValue {
  theme: Theme;
  appearance: Appearance;
  setPreference: (preference: ThemePreference) => void;
  setAccent: (accent: AccentName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Lecture synchrone au premier rendu : pas de « flash » de la mauvaise couleur au démarrage.
  const [appearance, setAppearance] = useState<Appearance>(() => parseAppearance(readAppearance()));

  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance((current) => {
      const next = { ...current, ...patch };
      writeAppearance(JSON.stringify(next));
      return next;
    });
  }, []);

  const mode =
    appearance.preference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : appearance.preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(mode, appearance.accent),
      appearance,
      setPreference: (preference) => update({ preference }),
      setAccent: (accent) => update({ accent }),
    }),
    [mode, appearance, update],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context)
    throw new Error('useTheme() doit être utilisé sous <ThemeProvider> (AppProviders).');
  return context;
}

/** Thème actif : `colors` (rôles), `states` (couleurs des états glycémiques), `mode`. */
export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** Préférences d'apparence et leurs modificateurs (écran Réglages → Apparence). */
export function useAppearance() {
  const { appearance, setPreference, setAccent } = useThemeContext();
  return { ...appearance, setPreference, setAccent };
}
