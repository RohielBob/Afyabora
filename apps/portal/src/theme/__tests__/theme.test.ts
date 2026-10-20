// Ticket L1-11 : le portail utilise les MÊMES jetons que le mobile (ADR-0008), en clair et en sombre.
// PR « thème du portail » : le médecin choisit le thème et la couleur d'accent (menu « Apparence »).
import { ACCENT_NAMES, brand, buildTheme, durations } from '@glyka/ui-tokens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, colorDeclarations, motionDeclarations, themeStylesheet } from '../theme';

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

  it('chaque couleur d’accent donne son propre bouton principal, en clair et en sombre', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const accent of ACCENT_NAMES) {
        const { primary, onPrimary, primaryText } = buildTheme(mode, accent).colors;
        const css = colorDeclarations(mode, accent);
        expect(css).toContain(`--afy-primary: ${primary};`);
        expect(css).toContain(`--afy-on-primary: ${onPrimary};`);
        expect(css).toContain(`--afy-primary-text: ${primaryText};`);
      }
    }
    expect(colorDeclarations('light', 'marine')).not.toContain(`--afy-primary: ${brand.red};`);
  });

  it('les états glycémiques ont leurs variables, sans le rouge de la marque, quel que soit l’accent', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { states } = buildTheme(mode);
      for (const accent of ACCENT_NAMES) {
        const css = colorDeclarations(mode, accent);
        expect(css).toContain(`--afy-state-very-low-bg: ${states.VERY_LOW.bg};`);
        expect(css).toContain(`--afy-state-in-range-fg: ${states.IN_RANGE.fg};`);
        expect(css).toContain(`--afy-state-very-high-border: ${states.VERY_HIGH.border};`);
      }
      for (const tone of Object.values(states)) {
        expect(Object.values(tone)).not.toContain(brand.red);
      }
    }
  });

  it('la feuille de style ne contient que le mode choisi (le choix gagne sur l’ordinateur)', () => {
    const dark = themeStylesheet('dark', 'framboise');
    expect(dark).toContain('color-scheme: dark;');
    expect(dark).toContain(`--afy-background: ${buildTheme('dark').colors.background};`);
    expect(dark).toContain(`--afy-primary: ${buildTheme('dark', 'framboise').colors.primary};`);
    expect(dark).not.toContain('prefers-color-scheme');
    expect(themeStylesheet('light')).toContain('color-scheme: light;');
  });

  it('les durées d’animation sont celles du mobile', () => {
    expect(motionDeclarations()).toContain(`--afy-duration-base: ${durations.base}ms;`);
    expect(motionDeclarations()).toContain('--afy-ease-standard: cubic-bezier(0.2, 0, 0, 1);');
  });
});

// ---------- Écriture dans la page ----------

/** Fausse page minimale : <head>, <html data-theme> et getElementById. */
function fakeDocument() {
  const elements = new Map<string, { id: string; textContent: string; parentNode: unknown }>();
  const head = {
    children: [] as unknown[],
    appendChild(node: { id: string; parentNode: unknown }) {
      node.parentNode = head;
      head.children.push(node);
      elements.set(node.id, node as never);
    },
  };
  const doc = {
    head,
    documentElement: { dataset: {} as Record<string, string> },
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: () => ({ id: '', textContent: '', parentNode: null }),
  };
  return doc;
}

describe('application du thème', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('pose la feuille #afy-theme et data-theme, puis la REMPLACE au changement (jamais deux feuilles)', () => {
    const doc = fakeDocument();
    applyTheme('dark', 'marine', doc as unknown as Document);
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(doc.getElementById('afy-theme')?.textContent).toBe(themeStylesheet('dark', 'marine'));

    applyTheme('light', 'rubis', doc as unknown as Document);
    expect(doc.head.children).toHaveLength(1);
    expect(doc.documentElement.dataset.theme).toBe('light');
    expect(doc.getElementById('afy-theme')?.textContent).toBe(themeStylesheet('light', 'rubis'));
  });

  it('« Automatique » suit l’ordinateur, y compris quand il change en cours de route', async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    const media = {
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal('window', {
      matchMedia: () => media,
      localStorage: {
        getItem: () => '{"preference":"system","accent":"rubis"}',
        setItem: () => undefined,
      },
    });
    const { startTheme } = await import('../theme');
    const { setAppearance } = await import('../appearance');
    const doc = fakeDocument();

    const stop = startTheme(doc as unknown as Document);
    expect(doc.documentElement.dataset.theme).toBe('dark');

    dark = false;
    listeners.forEach((listener) => listener());
    expect(doc.documentElement.dataset.theme).toBe('light');

    // Un choix explicite gagne sur l'ordinateur.
    setAppearance({ preference: 'dark' });
    expect(doc.documentElement.dataset.theme).toBe('dark');

    stop();
    expect(listeners.size).toBe(0);
  });

  it('navigateur sans matchMedia ni stockage : Clair, sans erreur', async () => {
    vi.stubGlobal('window', {});
    const { startTheme } = await import('../theme');
    const doc = fakeDocument();
    expect(() => startTheme(doc as unknown as Document)).not.toThrow();
    expect(doc.documentElement.dataset.theme).toBe('light');
  });
});
