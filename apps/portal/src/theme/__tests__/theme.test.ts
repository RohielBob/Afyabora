// Ticket L1-11 : le portail utilise les MÊMES jetons que le mobile (ADR-0008), en clair et en sombre.
import { brand, buildTheme, durations } from '@glyka/ui-tokens';
import { describe, expect, it } from 'vitest';
import { colorDeclarations, motionDeclarations, themeStylesheet } from '../theme';

describe('thème du portail', () => {
  it('le bouton principal est le rouge Afyabora en clair', () => {
    expect(colorDeclarations('light')).toContain(`--afy-primary: ${brand.red};`);
  });

  it('chaque rôle de couleur devient une variable, en clair et en sombre', () => {
    for (const mode of ['light', 'dark'] as const) {
      const css = colorDeclarations(mode);
      for (const value of Object.values(buildTheme(mode).colors)) {
        expect(css).toContain(value);
      }
      expect(css).toContain('--afy-primary-text:');
      expect(css).toContain('--afy-wordmark:');
    }
  });

  it('le mode sombre suit le réglage de l’ordinateur', () => {
    expect(themeStylesheet()).toContain('@media (prefers-color-scheme: dark)');
  });

  it('les durées d’animation sont celles du mobile', () => {
    expect(motionDeclarations()).toContain(`--afy-duration-base: ${durations.base}ms;`);
    expect(motionDeclarations()).toContain('--afy-ease-standard: cubic-bezier(0.2, 0, 0, 1);');
  });
});
