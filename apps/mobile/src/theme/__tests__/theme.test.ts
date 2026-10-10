// Système de design (L7-03, ADR-0008) : garde-fous automatiques.
// Si quelqu'un modifie une couleur et rend un texte illisible, ou remet du rouge dans les états glycémiques,
// la CI échoue ici.
import {
  ACCENT_NAMES,
  accentScales,
  brand,
  buildTheme,
  contrastRatio,
  textStyles,
  type ColorMode,
} from '@glyka/ui-tokens';
import { parseAppearance } from '../appearance';

const MODES: ColorMode[] = ['light', 'dark'];
const AA_TEXT = 4.5; // texte courant
const AA_NON_TEXT = 3; // grands textes, contours, formes (bouton sur le fond)

describe('contrastes AA de chaque thème (2 modes × 4 couleurs d’accent)', () => {
  const cases = MODES.flatMap((mode) => ACCENT_NAMES.map((accent) => [mode, accent] as const));

  it.each(cases)('%s / %s : textes lisibles', (mode, accent) => {
    const c = buildTheme(mode, accent).colors;
    const pairs: [string, string, string, number][] = [
      ['texte / fond', c.text, c.background, AA_TEXT],
      ['texte / surface', c.text, c.surface, AA_TEXT],
      ['texte secondaire / fond', c.textMuted, c.background, AA_TEXT],
      ['texte secondaire / surface en retrait', c.textMuted, c.surfaceMuted, AA_TEXT],
      ['texte du bouton / bouton', c.onPrimary, c.primary, AA_TEXT],
      ['texte du bouton / bouton enfoncé', c.onPrimary, c.primaryPressed, AA_TEXT],
      ['lien / fond', c.primaryText, c.background, AA_TEXT],
      ['lien / fond teinté', c.primaryText, c.primarySoft, AA_TEXT],
      ['erreur / fond', c.danger, c.background, AA_TEXT],
      ['erreur / fond d’erreur', c.danger, c.dangerSoft, AA_TEXT],
      ['bouton / fond (forme)', c.primary, c.background, AA_NON_TEXT],
      ['bordure du champ actif / surface', c.focus, c.surface, AA_NON_TEXT],
      ['texte discret / fond (grand texte)', c.textSubtle, c.background, AA_NON_TEXT],
    ];
    const failures = pairs
      .map(([name, fg, bg, min]) => ({ name, ratio: contrastRatio(fg, bg), min }))
      .filter((p) => p.ratio < p.min)
      .map((p) => `${p.name} : ${p.ratio.toFixed(2)} < ${p.min}`);
    expect(failures).toEqual([]);
  });

  it.each(MODES)('%s : chaque badge d’état glycémique est lisible', (mode) => {
    const { states } = buildTheme(mode);
    for (const [state, c] of Object.entries(states)) {
      expect({ state, ratio: contrastRatio(c.fg, c.bg) >= AA_TEXT }).toEqual({
        state,
        ratio: true,
      });
    }
  });
});

describe('règles de la charte', () => {
  it('le rouge de la goutte est la couleur des boutons du thème par défaut (clair, Rubis)', () => {
    expect(buildTheme('light').colors.primary).toBe(brand.red);
  });

  it('aucun état glycémique n’utilise un rouge de la marque ou de l’échelle Rubis / Framboise', () => {
    const reds = new Set(
      [
        ...Object.values(brand),
        ...Object.values(accentScales.rubis),
        ...Object.values(accentScales.framboise),
      ].map((c) => c.toUpperCase()),
    );
    for (const mode of MODES) {
      for (const c of Object.values(buildTheme(mode).states)) {
        expect(reds.has(c.bg.toUpperCase())).toBe(false);
        expect(reds.has(c.fg.toUpperCase())).toBe(false);
      }
    }
  });

  it('l’échelle typographique est ordonnée (titres plus grands que le texte)', () => {
    const sizes = ['display', 'title', 'heading', 'subheading', 'body', 'bodySmall', 'caption'].map(
      (v) => textStyles[v as keyof typeof textStyles].fontSize,
    );
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });
});

describe('préférence d’apparence enregistrée', () => {
  it('par défaut : thème clair, accent Rubis', () => {
    expect(parseAppearance(null)).toEqual({ preference: 'light', accent: 'rubis' });
  });

  it('relit un choix valide', () => {
    expect(parseAppearance('{"preference":"dark","accent":"marine"}')).toEqual({
      preference: 'dark',
      accent: 'marine',
    });
  });

  it('ignore une valeur illisible ou inconnue sans planter', () => {
    expect(parseAppearance('pas du json')).toEqual({ preference: 'light', accent: 'rubis' });
    expect(parseAppearance('{"preference":"violet","accent":"arc-en-ciel"}')).toEqual({
      preference: 'light',
      accent: 'rubis',
    });
    expect(parseAppearance('null')).toEqual({ preference: 'light', accent: 'rubis' });
  });
});
