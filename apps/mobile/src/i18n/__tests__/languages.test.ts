// Choix de la langue (Réglages → Langue) et qualité des fichiers de traduction.
import i18next from 'i18next';
import en from '../en.json';
import es from '../es.json';
import fr from '../fr.json';
import kg from '../kg.json';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  formatLocale,
  isLanguageCode,
  languageInfo,
  parsePreference,
  resolveLanguage,
} from '../languages';
import ln from '../ln.json';
import lua from '../lua.json';
import pt from '../pt.json';
import sw from '../sw.json';

const FILES = { fr, en, es, pt, ln, sw, kg, lua } as const;

describe('choix de la langue', () => {
  it('« Langue du téléphone » : la première langue du téléphone que l’application connaît', () => {
    expect(resolveLanguage('system', ['pt-BR', 'fr'])).toBe('pt');
    expect(resolveLanguage('system', ['de', 'es_ES', 'en'])).toBe('es');
    expect(resolveLanguage('system', ['EN'])).toBe('en');
    // Langues de la RD Congo, dont le code à 3 lettres du tshiluba.
    expect(resolveLanguage('system', ['ln-CD', 'fr'])).toBe('ln');
    expect(resolveLanguage('system', ['sw_CD'])).toBe('sw');
    expect(resolveLanguage('system', ['lua'])).toBe('lua');
    expect(resolveLanguage('system', ['kg'])).toBe('kg');
  });

  it('téléphone dans une langue inconnue (ou sans langue) : français', () => {
    expect(resolveLanguage('system', ['de', 'zh'])).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('system', [null, undefined])).toBe('fr');
    expect(resolveLanguage('system', [])).toBe('fr');
  });

  it('langue choisie : elle gagne sur celle du téléphone', () => {
    expect(resolveLanguage('es', ['pt', 'en'])).toBe('es');
  });

  it('choix enregistré absent, inconnu ou abîmé : « Langue du téléphone »', () => {
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference('de')).toBe('system');
    expect(parsePreference('')).toBe('system');
    expect(parsePreference('pt')).toBe('pt');
  });

  it('liste : codes uniques, chaque langue a son fichier et son nom écrit dans sa langue', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(Object.keys(FILES)).toContain(code);
    expect(languageInfo('es').nativeName).toBe('Español');
    expect(languageInfo('ln').nativeName).toBe('Lingála');
    expect(languageInfo('lua').nativeName).toBe('Tshiluba');
    expect(isLanguageCode('pt')).toBe(true);
    expect(isLanguageCode('xx')).toBe(false);
  });

  it('français et anglais relus ; toutes les autres langues signalées « en relecture »', () => {
    expect(languageInfo('fr').reviewed).toBe(true);
    expect(languageInfo('en').reviewed).toBe(true);
    expect(languageInfo('es').reviewed).toBe(false);
    expect(languageInfo('pt').reviewed).toBe(false);
    for (const code of ['ln', 'sw', 'kg', 'lua'] as const)
      expect(languageInfo(code).reviewed).toBe(false);
  });
});

describe('dates et nombres (formatLocale)', () => {
  it('langue connue du moteur des dates : gardée', () => {
    expect(formatLocale('ln', () => true)).toBe('ln');
    expect(formatLocale('en', () => true)).toBe('en');
  });

  it('langue inconnue du moteur (kikongo, tshiluba…) : français, jamais la langue de l’appareil', () => {
    expect(formatLocale('kg', () => false)).toBe('fr');
    expect(formatLocale('lua', (c) => c !== 'lua')).toBe('fr');
  });

  it('moteur qui plante sur un code : français, sans erreur', () => {
    const broken = () => {
      throw new RangeError('invalid language tag');
    };
    expect(formatLocale('xx', broken)).toBe('fr');
  });

  it('moteur réel : le résultat est toujours utilisable pour écrire une date', () => {
    for (const { code } of LANGUAGES) {
      const locale = formatLocale(code);
      expect(Intl.DateTimeFormat.supportedLocalesOf([locale])).toEqual([locale]);
    }
  });
});

// ---------- Qualité des traductions (toutes les langues contre le français) ----------

type Dict = Record<string, unknown>;
const flat = (node: unknown, prefix = ''): [string, string][] =>
  typeof node === 'string'
    ? [[prefix, node]]
    : Object.entries(node as Dict).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
const variables = (text: string) => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort().join(' ');
const reference = new Map(flat(fr));

describe.each(Object.keys(FILES))('traduction « %s »', (code) => {
  const entries = new Map(flat(FILES[code as keyof typeof FILES]));

  it('exactement les mêmes clés que le français (rien d’oublié, rien en trop)', () => {
    expect([...entries.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it('mêmes {{variables}} que le français dans chaque texte', () => {
    const wrong = [...reference]
      .filter(([key, text]) => variables(text) !== variables(entries.get(key) ?? ''))
      .map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('aucun texte vide ni caractère invisible (espace insécable, contrôle, largeur nulle)', () => {
    const invisible = (c: number) =>
      c < 32 || c === 160 || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233;
    const bad = [...entries]
      .filter(([, text]) => !text.trim() || [...text].some((ch) => invisible(ch.charCodeAt(0))))
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it('pluriels : un texte existe pour 0, 1, 2, 5, 21, 100 et 1 000 000 (règles de la langue)', async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: code,
      fallbackLng: false,
      resources: { [code]: { translation: FILES[code as keyof typeof FILES] } },
    });
    const pluralKeys = new Set(
      [...reference.keys()]
        .filter((key) => /_(one|other)$/.test(key))
        .map((key) => key.replace(/_(one|other)$/, '')),
    );
    const missing: string[] = [];
    for (const key of pluralKeys) {
      for (const count of [0, 1, 2, 5, 21, 100, 1_000_000]) {
        const text = instance.t(key, { count });
        if (text === key || !text.trim()) missing.push(`${key} (${count})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
