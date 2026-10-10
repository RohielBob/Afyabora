// Palette Afyabora — système de design (L7-03), décisions de l'ADR-0008.
//
// Trois niveaux, comme dans un système de design professionnel :
//  1. les ÉCHELLES (50 → 950) : toutes les nuances autorisées, rien d'autre n'est utilisé ;
//  2. les THÈMES : clair / sombre × couleur d'accent, qui donnent un RÔLE à chaque nuance
//     (fond, surface, texte, action…) — voir `buildTheme` ;
//  3. les composants, qui n'utilisent QUE les rôles (jamais une couleur écrite en dur).
//
// Règles (docs/design/marque-afyabora.md) :
//  - le rouge Afyabora est la couleur PRINCIPALE de l'interface (boutons, éléments clés) ;
//  - un état glycémique n'est JAMAIS rouge ni exprimé par la couleur seule (couleur + symbole + libellé) :
//    les états ont leur propre palette (`glucoseStates`), sans rouge, pour ne pas être confondus avec la marque ;
//  - chaque couple texte / fond est vérifié automatiquement (contraste AA) par les tests du mobile.

/** Couleurs du logo (goutte, « Afya », « bora »). */
export const brand = {
  red: '#E4002B', // goutte (milieu du dégradé) — rouge principal de l'interface
  redLight: '#FF3A4A', // goutte, haut gauche du dégradé
  redDark: '#A80024', // goutte, bas droit du dégradé
  coral: '#F83E44', // « bora »
  navy: '#0B3366', // « Afya »
} as const;

export type Scale = Readonly<
  Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>
>;

/** Neutres « encre » légèrement bleutés : ils mettent le rouge en valeur sans paraître gris sale. */
export const ink: Scale & { 0: string; 25: string; 850: string } = {
  0: '#FFFFFF',
  25: '#FCFCFD',
  50: '#F7F8FA',
  100: '#EFF1F5',
  200: '#E3E6EC',
  300: '#CDD2DB',
  400: '#A3AAB7',
  500: '#7A8394',
  600: '#5B6475',
  700: '#434B5A',
  800: '#2C323D',
  850: '#222730',
  900: '#191D24',
  950: '#101318',
};

/** Échelles des couleurs d'accent proposées dans Réglages → Apparence (thèmes préparés, ADR-0008). */
export const accentScales = {
  /** Rubis : le rouge de la goutte. Thème par défaut. */
  rubis: {
    50: '#FFF1F2',
    100: '#FFE0E3',
    200: '#FFC2C8',
    300: '#FF95A0',
    400: '#FF5A6B',
    500: '#F7223D',
    600: '#E4002B',
    700: '#BE0024',
    800: '#9C0420',
    900: '#82081E',
    950: '#48000D',
  },
  /** Framboise : rouge plus doux, rosé. */
  framboise: {
    50: '#FDF2F6',
    100: '#FCE7EF',
    200: '#FACFE0',
    300: '#F6A8C4',
    400: '#EF739F',
    500: '#E3487D',
    600: '#C8255E',
    700: '#A81B4C',
    800: '#8B1A41',
    900: '#74193A',
    950: '#470A1E',
  },
  /** Marine : le bleu de « Afya ». */
  marine: {
    50: '#EFF5FF',
    100: '#DCE8FB',
    200: '#BFD5F6',
    300: '#92B7EE',
    400: '#5F90E2',
    500: '#3B6FD3',
    600: '#2554B4',
    700: '#1C428F',
    800: '#143572',
    900: '#0B3366',
    950: '#071E3D',
  },
  /** Graphite : sobre, presque monochrome. */
  graphite: {
    50: '#F6F7F9',
    100: '#ECEEF2',
    200: '#D6DAE1',
    300: '#B3BAC6',
    400: '#8A94A5',
    500: '#6B7587',
    600: '#555E6E',
    700: '#454C59',
    800: '#3A404B',
    900: '#2A2F37',
    950: '#16191E',
  },
} as const satisfies Record<string, Scale>;

export type AccentName = keyof typeof accentScales;
export const ACCENT_NAMES = Object.keys(accentScales) as AccentName[];
export const DEFAULT_ACCENT: AccentName = 'rubis';

/** Nom affiché dans Réglages → Apparence. */
export const ACCENT_LABELS: Record<AccentName, string> = {
  rubis: 'Rubis',
  framboise: 'Framboise',
  marine: 'Marine',
  graphite: 'Graphite',
};

export type ColorMode = 'light' | 'dark';

/**
 * États glycémiques : palette SANS rouge (le rouge est la couleur de la marque, ADR-0008).
 * Bas = violets (le plus foncé = le plus urgent), plage = vert, haut = ambre → orange brûlé.
 * `solid` (fond plein + texte blanc) pour les états extrêmes, `soft` (fond clair + texte foncé) sinon.
 */
export const glucoseStates = {
  light: {
    VERY_LOW: { fg: '#FFFFFF', bg: '#5B21B6', border: '#5B21B6' },
    LOW: { fg: '#5B21B6', bg: '#F1EBFF', border: '#D9CCFF' },
    IN_RANGE: { fg: '#166534', bg: '#E5F7EC', border: '#B7E6C8' },
    HIGH: { fg: '#92400E', bg: '#FEF3DC', border: '#F7D9A0' },
    VERY_HIGH: { fg: '#FFFFFF', bg: '#9A3412', border: '#9A3412' },
  },
  dark: {
    VERY_LOW: { fg: '#FFFFFF', bg: '#6D35D9', border: '#6D35D9' },
    LOW: { fg: '#C9B6FF', bg: '#251B44', border: '#3B2D6B' },
    IN_RANGE: { fg: '#86E0A8', bg: '#10301F', border: '#1D4D33' },
    HIGH: { fg: '#F8C76B', bg: '#33240C', border: '#5A3F14' },
    VERY_HIGH: { fg: '#FFFFFF', bg: '#B5431A', border: '#B5431A' },
  },
} as const;

/** Rôles de couleur utilisés par TOUS les composants. */
export interface ThemeColors {
  background: string; // fond de l'écran
  surface: string; // cartes, champs
  surfaceMuted: string; // zones en retrait (fond de liste, squelette de chargement)
  surfaceRaised: string; // éléments au-dessus (feuilles, menus)
  border: string;
  borderStrong: string;
  text: string; // texte principal
  textMuted: string; // texte secondaire (contraste AA garanti)
  textSubtle: string; // indications discrètes, GRANDS textes ou décor seulement
  primary: string; // remplissage des boutons principaux
  primaryPressed: string;
  onPrimary: string; // texte posé sur `primary`
  primarySoft: string; // fond teinté (sélection, puce active)
  primarySoftBorder: string;
  primaryText: string; // liens et texte d'accent posés sur `background`
  focus: string; // champ actif : encre neutre (jamais rouge, pour ne pas ressembler à une erreur)
  overlay: string; // voile derrière une feuille modale
  skeleton: string; // base des blocs de chargement
  skeletonHighlight: string; // reflet qui glisse sur le squelette
  danger: string; // erreurs de formulaire (pas un état de santé)
  dangerSoft: string;
  success: string;
  warning: string;
  info: string;
}

export interface Theme {
  mode: ColorMode;
  accent: AccentName;
  colors: ThemeColors;
  states: (typeof glucoseStates)[ColorMode];
}

/** Construit le thème complet d'un mode et d'une couleur d'accent. */
export function buildTheme(mode: ColorMode, accent: AccentName = DEFAULT_ACCENT): Theme {
  const a = accentScales[accent];
  const graphite = accent === 'graphite';

  if (mode === 'light') {
    return {
      mode,
      accent,
      states: glucoseStates.light,
      colors: {
        background: ink[0],
        surface: ink[0],
        surfaceMuted: ink[50],
        surfaceRaised: ink[0],
        border: ink[200],
        borderStrong: ink[300],
        text: ink[900],
        textMuted: ink[600],
        textSubtle: ink[500],
        primary: graphite ? a[800] : a[600],
        primaryPressed: graphite ? a[900] : a[700],
        onPrimary: '#FFFFFF',
        primarySoft: a[50],
        primarySoftBorder: a[200],
        primaryText: graphite ? a[800] : a[700],
        // Champ actif en encre foncée : avec un rouge principal, un focus rouge passerait pour une erreur.
        focus: ink[800],
        overlay: 'rgba(16, 19, 24, 0.45)',
        skeleton: ink[100],
        skeletonHighlight: ink[50],
        danger: '#C0262D',
        dangerSoft: '#FDECEC',
        success: '#15803D',
        warning: '#B45309',
        info: '#2554B4',
      },
    };
  }

  return {
    mode,
    accent,
    states: glucoseStates.dark,
    colors: {
      background: ink[950],
      surface: ink[900],
      surfaceMuted: '#14171D',
      surfaceRaised: ink[850],
      border: ink[800],
      borderStrong: ink[700],
      text: '#F3F5F8',
      textMuted: ink[400],
      textSubtle: ink[500],
      // En sombre, Graphite devient clair (bouton clair, texte foncé) et Marine monte d'une nuance :
      // sinon le bouton se confondrait avec le fond (contraste non-texte < 3, vérifié par les tests).
      primary: graphite ? a[200] : accent === 'marine' ? a[500] : a[600],
      primaryPressed: graphite ? a[300] : accent === 'marine' ? a[600] : a[700],
      onPrimary: graphite ? a[950] : '#FFFFFF',
      primarySoft: graphite ? a[900] : a[950],
      primarySoftBorder: graphite ? a[700] : a[800],
      primaryText: a[300],
      focus: ink[300],
      overlay: 'rgba(0, 0, 0, 0.6)',
      skeleton: ink[850],
      skeletonHighlight: ink[800],
      danger: '#FF8A8A',
      dangerSoft: '#3A1517',
      success: '#4ADE80',
      warning: '#FBBF24',
      info: '#8AB4FF',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Compatibilité : anciens écrans provisoires (L1-06 les remplacera). Utiliser `useTheme()` dans le code neuf.
const legacy = (theme: Theme) => ({
  primary: theme.colors.primary,
  primaryDark: theme.colors.primaryPressed,
  primaryLight: theme.colors.primarySoft,
  accent: brand.coral,
  background: theme.colors.background,
  surface: theme.colors.surface,
  text: theme.colors.text,
  textMuted: theme.colors.textMuted,
  border: theme.colors.border,
  danger: theme.colors.danger,
  state: {
    veryLow: theme.states.VERY_LOW.bg,
    low: theme.states.LOW.fg,
    inRange: theme.states.IN_RANGE.fg,
    high: theme.states.HIGH.fg,
    veryHigh: theme.states.VERY_HIGH.bg,
  },
});
/** @deprecated utiliser `buildTheme('light')` ou `useTheme()` du mobile. */
export const colors = legacy(buildTheme('light'));
/** @deprecated utiliser `buildTheme('dark')` ou `useTheme()` du mobile. */
export const darkColors = legacy(buildTheme('dark'));

// ---------------------------------------------------------------------------------------------
/** Rapport de contraste WCAG 2.1 entre deux couleurs « #RRGGBB » (1 à 21). AA : ≥ 4,5 (texte), ≥ 3 (grand texte). */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}
