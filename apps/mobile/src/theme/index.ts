// Point d'entrée du thème mobile. Code neuf : `useTheme()` (couleurs du thème actif) + jetons ci-dessous.
export {
  brand,
  accentScales,
  ACCENT_NAMES,
  ACCENT_LABELS,
  buildTheme,
  contrastRatio,
  textStyles,
  fontFiles,
  spacing,
  radii,
  elevation,
  touchTarget,
  durations,
  springs,
  pressScale,
  // Compatibilité avec les écrans provisoires (seront remplacés en L1-06) :
  colors,
  darkColors,
  fontSizes,
  fontWeights,
  fontFamilies,
} from '@glyka/ui-tokens';
export type { AccentName, Theme, ThemeColors, TextVariant, TextStyleToken } from '@glyka/ui-tokens';
export { ThemeProvider, useTheme, useAppearance } from './ThemeProvider';
export {
  parseAppearance,
  DEFAULT_PREFERENCE,
  type Appearance,
  type ThemePreference,
} from './appearance';
export { easing, enterFromBelow, fadeIn, fadeOut, useReducedMotion } from './motion';
