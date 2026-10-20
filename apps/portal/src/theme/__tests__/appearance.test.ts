// Menu « Apparence » du portail : relecture du choix enregistré, mode affiché, et garde du choix.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE, STORAGE_KEY, parseAppearance, resolveMode } from '../appearance';

describe('relecture du choix enregistré', () => {
  it('rien d’enregistré : Clair et Rubis (ADR-0008, comme le mobile)', () => {
    expect(parseAppearance(null)).toEqual({ preference: 'light', accent: 'rubis' });
    expect(DEFAULT_APPEARANCE).toEqual({ preference: 'light', accent: 'rubis' });
  });

  it('choix valide : relu tel quel', () => {
    expect(parseAppearance('{"preference":"dark","accent":"marine"}')).toEqual({
      preference: 'dark',
      accent: 'marine',
    });
    expect(parseAppearance('{"preference":"system","accent":"graphite"}')).toEqual({
      preference: 'system',
      accent: 'graphite',
    });
  });

  it('valeur inconnue : remplacée par le défaut, champ par champ', () => {
    expect(parseAppearance('{"preference":"neon","accent":"framboise"}')).toEqual({
      preference: 'light',
      accent: 'framboise',
    });
    expect(parseAppearance('{"preference":"dark","accent":"vert"}')).toEqual({
      preference: 'dark',
      accent: 'rubis',
    });
  });

  it('texte abîmé, null ou tableau : défaut, sans erreur', () => {
    expect(parseAppearance('{pas du json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('null')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('[1,2]')).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('mode affiché', () => {
  it('Clair et Sombre ignorent le réglage de l’ordinateur', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('Automatique suit le réglage de l’ordinateur', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });
});

describe('garde du choix dans le navigateur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** Faux localStorage en mémoire. */
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  }

  it('relit le choix au démarrage, l’enregistre et prévient les abonnés', async () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{"preference":"dark","accent":"marine"}' });
    vi.stubGlobal('window', { localStorage: storage });
    const store = await import('../appearance');

    expect(store.getAppearance()).toEqual({ preference: 'dark', accent: 'marine' });

    const listener = vi.fn();
    const stop = store.subscribeAppearance(listener);
    store.setAppearance({ accent: 'graphite' });

    expect(store.getAppearance()).toEqual({ preference: 'dark', accent: 'graphite' });
    expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? '')).toEqual({
      preference: 'dark',
      accent: 'graphite',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    store.setAppearance({ preference: 'light' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stockage bloqué (navigation privée) : le portail marche, le choix vaut pour l’onglet', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('bloqué', 'SecurityError');
      },
    });
    const store = await import('../appearance');

    expect(store.getAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(() => store.setAppearance({ preference: 'dark' })).not.toThrow();
    expect(store.getAppearance().preference).toBe('dark');
  });

  it('stockage plein : l’écriture échoue sans casser le changement de thème', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('plein', 'QuotaExceededError');
      },
    };
    vi.stubGlobal('window', { localStorage: storage });
    const store = await import('../appearance');
    const listener = vi.fn();
    store.subscribeAppearance(listener);

    store.setAppearance({ accent: 'framboise' });

    expect(store.getAppearance().accent).toBe('framboise');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
