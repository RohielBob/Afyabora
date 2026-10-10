// Typographie Afyabora (L7-03, ADR-0008) : « Plus Jakarta Sans », une seule famille, plusieurs graisses.
// Sur Android, une police personnalisée ne change pas de graisse avec `fontWeight` : chaque graisse est
// donc un fichier (et un nom) distinct, chargé au démarrage par le mobile (@expo-google-fonts).

export const fontFiles = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;
export type FontWeightName = keyof typeof fontFiles;

export interface TextStyleToken {
  fontSize: number;
  lineHeight: number;
  weight: FontWeightName;
  letterSpacing: number;
  uppercase?: boolean;
  /** Chiffres de même largeur (valeurs de glycémie qui ne « sautent » pas en changeant). */
  tabular?: boolean;
}

/** Échelle typographique (ratio ~1,2) : chaque texte de l'app utilise UN de ces styles. */
export const textStyles = {
  display: { fontSize: 34, lineHeight: 40, weight: 'extrabold', letterSpacing: -0.8 },
  title: { fontSize: 26, lineHeight: 32, weight: 'bold', letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, weight: 'bold', letterSpacing: -0.3 },
  subheading: { fontSize: 17, lineHeight: 24, weight: 'semibold', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 24, weight: 'regular', letterSpacing: 0 },
  bodyStrong: { fontSize: 16, lineHeight: 24, weight: 'semibold', letterSpacing: 0 },
  bodySmall: { fontSize: 14, lineHeight: 20, weight: 'regular', letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 20, weight: 'semibold', letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16, weight: 'medium', letterSpacing: 0.1 },
  overline: { fontSize: 11, lineHeight: 16, weight: 'bold', letterSpacing: 1.2, uppercase: true },
  metric: { fontSize: 48, lineHeight: 52, weight: 'extrabold', letterSpacing: -1.5, tabular: true },
} as const satisfies Record<string, TextStyleToken>;
export type TextVariant = keyof typeof textStyles;

// Compatibilité avec les écrans provisoires.
/** @deprecated utiliser `textStyles`. */
export const fontFamilies = { heading: fontFiles.bold, body: fontFiles.regular } as const;
/** @deprecated utiliser `textStyles`. */
export const fontSizes = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 36 } as const;
/** @deprecated utiliser `textStyles`. */
export const fontWeights = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
