// Langues du portail : choix de la langue, textes « vivants », dates, et qualité des 8 traductions.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '../en';
import { fr } from '../fr';
import { MESSAGES } from '../index';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  formatLocale,
  isLanguageCode,
  languageInfo,
  parsePreference,
  resolveLanguage,
} from '../languages';

describe('choix de la langue', () => {
  it('« Langue du navigateur » : la première langue du navigateur que le portail connaît', () => {
    expect(resolveLanguage('system', ['pt-BR', 'fr'])).toBe('pt');
    expect(resolveLanguage('system', ['de', 'es_ES', 'en'])).toBe('es');
    expect(resolveLanguage('system', ['ln-CD', 'fr'])).toBe('ln');
    expect(resolveLanguage('system', ['lua'])).toBe('lua');
    expect(resolveLanguage('system', ['EN-GB'])).toBe('en');
  });

  it('navigateur dans une langue inconnue (ou sans langue) : français', () => {
    expect(resolveLanguage('system', ['de', 'zh'])).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('system', [null, undefined])).toBe('fr');
    expect(resolveLanguage('system', [])).toBe('fr');
  });

  it('langue choisie : elle gagne sur celle du navigateur', () => {
    expect(resolveLanguage('sw', ['pt', 'en'])).toBe('sw');
  });

  it('choix enregistré absent, inconnu ou abîmé : « Langue du navigateur »', () => {
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference('de')).toBe('system');
    expect(parsePreference('')).toBe('system');
    expect(parsePreference('kg')).toBe('kg');
  });

  it('liste : 8 langues, codes uniques, chacune avec ses textes et son nom écrit dans sa langue', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(codes).toEqual(['fr', 'en', 'es', 'pt', 'ln', 'sw', 'kg', 'lua']);
    expect(Object.keys(MESSAGES).sort()).toEqual([...codes].sort());
    expect(languageInfo('ln').nativeName).toBe('Lingála');
    expect(isLanguageCode('lua')).toBe(true);
    expect(isLanguageCode('xx')).toBe(false);
  });

  it('français et anglais relus ; toutes les autres langues signalées « en relecture »', () => {
    expect(languageInfo('fr').reviewed).toBe(true);
    expect(languageInfo('en').reviewed).toBe(true);
    for (const code of ['es', 'pt', 'ln', 'sw', 'kg', 'lua'] as const) {
      expect(languageInfo(code).reviewed).toBe(false);
    }
  });
});

describe('dates et nombres (formatLocale)', () => {
  it('langue inconnue du moteur (kikongo, tshiluba…) : français, jamais la langue du navigateur', () => {
    expect(formatLocale('kg', () => false)).toBe('fr');
    expect(formatLocale('sw', () => true)).toBe('sw');
  });

  it('moteur qui plante : français, sans erreur', () => {
    const broken = () => {
      throw new RangeError('invalid language tag');
    };
    expect(formatLocale('xx', broken)).toBe('fr');
  });

  it('moteur réel : le résultat sert toujours à écrire une date', () => {
    for (const { code } of LANGUAGES) {
      const locale = formatLocale(code);
      expect(Intl.DateTimeFormat.supportedLocalesOf([locale])).toEqual([locale]);
    }
  });
});

// ---------- Qualité des traductions (toutes les langues contre le français) ----------

const flat = (node: unknown, prefix = ''): [string, string][] =>
  typeof node === 'string'
    ? [[prefix, node]]
    : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
        flat(v, prefix ? `${prefix}.${k}` : k),
      );
const variables = (text: string) => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort().join(' ');
const reference = new Map(flat(fr));

describe.each(Object.keys(MESSAGES))('traduction « %s »', (code) => {
  const entries = new Map(flat(MESSAGES[code as keyof typeof MESSAGES]));

  it('exactement les mêmes textes que le français (listes de même longueur comprises)', () => {
    expect([...entries.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it('mêmes {{variables}} que le français dans chaque texte', () => {
    const wrong = [...reference]
      .filter(([key, text]) => variables(text) !== variables(entries.get(key) ?? ''))
      .map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('aucun texte vide, ni caractère invisible ou lettre ɛ/ɔ (absente de la police)', () => {
    const invisible = (c: number) =>
      c < 32 || c === 160 || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233;
    const bad = [...entries]
      .filter(
        ([, text]) =>
          !text.trim() ||
          [...text].some((ch) => invisible(ch.charCodeAt(0))) ||
          /[ɛɔƐƆͰ-Ͽ]/.test(text),
      )
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it('les noms propres et unités ne sont pas traduits', () => {
    const t = MESSAGES[code as keyof typeof MESSAGES];
    expect(t.app.name).toBe('Afyabora');
    expect(t.record.glucose.noNote).toBe('—');
  });
});

// ---------- Langue affichée et textes « vivants » ----------

describe('textes de la langue affichée', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  }

  it('sans choix : la langue du navigateur ; puis le choix enregistré gagne et est gardé', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('navigator', { languages: ['en-US', 'fr'], language: 'en-US' });
    const i18n = await import('../index');

    expect(i18n.getLanguagePreference()).toBe('system');
    expect(i18n.getLanguage()).toBe('en');
    expect(i18n.texts.login.title).toBe(en.login.title);

    const listener = vi.fn();
    i18n.subscribeLanguage(listener);
    i18n.setLanguagePreference('sw');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.data.get(i18n.STORAGE_KEY)).toBe('sw');
    expect(i18n.getLanguage()).toBe('sw');
    expect(i18n.texts.login.title).toBe(i18n.MESSAGES.sw.login.title);
  });

  it('une partie gardée dans une constante suit quand même la langue', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage({ 'glyka.portal.language': 'fr' }) });
    const i18n = await import('../index');
    const t = i18n.texts.record.glucose; // comme `const t = texts.record.glucose` en haut d'un fichier
    expect(t.table).toBe(fr.record.glucose.table);

    i18n.setLanguagePreference('pt');
    expect(t.table).toBe(i18n.MESSAGES.pt.record.glucose.table);
    expect(i18n.texts.brand.points).toEqual(i18n.MESSAGES.pt.brand.points);
  });

  it('Object.keys / Object.entries sur une partie : les clés du français, les textes de la langue', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage({ 'glyka.portal.language': 'kg' }) });
    const i18n = await import('../index');
    const categories = i18n.texts.patients.categories;
    expect(Object.keys(categories)).toEqual(Object.keys(fr.patients.categories));
    expect(Object.fromEntries(Object.entries(categories))).toEqual(
      i18n.MESSAGES.kg.patients.categories,
    );
  });

  it('dates : kikongo et tshiluba en français, swahili dans sa langue', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage({ 'glyka.portal.language': 'lua' }) });
    const i18n = await import('../index');
    expect(i18n.dateLocale()).toBe('fr');
    i18n.setLanguagePreference('sw');
    expect(i18n.dateLocale()).toBe('sw');
  });

  it('stockage bloqué (navigation privée) : français, et le choix vaut pour l’onglet', async () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('bloqué', 'SecurityError');
      },
    });
    const i18n = await import('../index');
    expect(i18n.getLanguage()).toBe('fr');
    expect(() => i18n.setLanguagePreference('ln')).not.toThrow();
    expect(i18n.texts.shell.signOut).toBe(i18n.MESSAGES.ln.shell.signOut);
  });

  it('la page suit la langue : attribut lang et titre de l’onglet', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage({ 'glyka.portal.language': 'fr' }) });
    const i18n = await import('../index');
    const doc = { documentElement: { lang: '' }, title: '' };
    const stop = i18n.startLanguage(doc as unknown as Document);
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe('Afyabora — Espace professionnel');

    i18n.setLanguagePreference('en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe('Afyabora — Professional area');

    stop();
    i18n.setLanguagePreference('es');
    expect(doc.documentElement.lang).toBe('en');
  });
});
