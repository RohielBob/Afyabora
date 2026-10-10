// Espacements, arrondis et ombres (L7-03). Grille de 4 points : toutes les marges sont des multiples de 4.
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Arrondis : plus l'élément est grand, plus l'arrondi est doux. */
export const radii = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32, pill: 999 } as const;

/** Taille minimale d'une zone touchable (accessibilité : 48 points). */
export const touchTarget = 48;

/** Ombres par niveau. En mode sombre, on hausse la surface au lieu d'ajouter de l'ombre (plus lisible). */
export const elevation = {
  0: { shadowOpacity: 0, shadowRadius: 0, shadowOffsetY: 0, androidElevation: 0 },
  1: { shadowOpacity: 0.06, shadowRadius: 8, shadowOffsetY: 2, androidElevation: 1 },
  2: { shadowOpacity: 0.08, shadowRadius: 16, shadowOffsetY: 6, androidElevation: 3 },
  3: { shadowOpacity: 0.12, shadowRadius: 28, shadowOffsetY: 12, androidElevation: 8 },
} as const;
export type ElevationLevel = keyof typeof elevation;
