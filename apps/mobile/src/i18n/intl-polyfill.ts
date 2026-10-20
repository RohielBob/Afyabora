// Règles du pluriel (« 1 mesure », « 5 mesures ») pour i18next, sur les téléphones Android.
//
// Le moteur JavaScript des téléphones Android (Hermes) ne fournit PAS `Intl.PluralRules`. Sans lui,
// i18next ne sait plus choisir entre `_one`, `_other` et `_many`, et l'écran affichait le NOM du texte
// (« dashboard.chart.period », « insights.insufficient.body »). Vu sur un vrai téléphone (APK, 2026-10-20),
// jamais dans le navigateur ni dans Jest, qui ont cette fonction.
//
// Pourquoi pas la bibliothèque @formatjs/intl-pluralrules : sur Hermes, elle demande aussi `Intl.Locale` et
// `Intl.getCanonicalLocales` (absents), donc deux autres bibliothèques. Nos 8 langues tiennent en quelques
// règles : on les écrit ici, telles que les donne CLDR (la référence officielle des règles de pluriel,
// https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html).
//
// À importer AVANT i18next (première ligne de src/i18n/index.ts). Rien n'est remplacé si le moteur a déjà
// la fonction (navigateur, Jest, futur Hermes).

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Opérandes CLDR d'un nombre : i = partie entière, v = nombre de chiffres après la virgule. */
function operands(value: number) {
  const n = Math.abs(value);
  const text = String(n);
  const dot = text.indexOf('.');
  return { n, i: Math.floor(n), v: dot === -1 ? 0 : text.length - dot - 1 };
}

/** « many » du français, de l'espagnol et du portugais : un million, un milliard… (1 000 000 de mesures). */
const isMillions = (i: number, v: number) => v === 0 && i !== 0 && i % 1_000_000 === 0;

/** Règles cardinales CLDR, par langue (code sans région : « pt-PT » → « pt »). */
export const CARDINAL_RULES: Record<
  string,
  { categories: Category[]; select: (n: number) => Category }
> = {
  // Français : « one » pour 0 et 1 (0 mesure, 1 mesure), « many » pour les millions.
  fr: {
    categories: ['one', 'many', 'other'],
    select: (value) => {
      const { i, v } = operands(value);
      if (i === 0 || i === 1) return 'one';
      return isMillions(i, v) ? 'many' : 'other';
    },
  },
  en: {
    categories: ['one', 'other'],
    select: (value) => {
      const { i, v } = operands(value);
      return i === 1 && v === 0 ? 'one' : 'other';
    },
  },
  es: {
    categories: ['one', 'many', 'other'],
    select: (value) => {
      const { n, i, v } = operands(value);
      if (n === 1) return 'one';
      return isMillions(i, v) ? 'many' : 'other';
    },
  },
  // Portugais d'Europe (celui de l'Angola, choisi pour pt.json).
  pt: {
    categories: ['one', 'many', 'other'],
    select: (value) => {
      const { i, v } = operands(value);
      if (i === 1 && v === 0) return 'one';
      return isMillions(i, v) ? 'many' : 'other';
    },
  },
  // Lingala : « one » pour 0 et 1, comme en français.
  ln: {
    categories: ['one', 'other'],
    select: (value) => (value === 0 || value === 1 ? 'one' : 'other'),
  },
  sw: {
    categories: ['one', 'other'],
    select: (value) => {
      const { i, v } = operands(value);
      return i === 1 && v === 0 ? 'one' : 'other';
    },
  },
  // Kikongo et tshiluba : absents de CLDR. Singulier pour 1, pluriel sinon (comme dans les traductions).
  kg: {
    categories: ['one', 'other'],
    select: (value) => (value === 1 ? 'one' : 'other'),
  },
  lua: {
    categories: ['one', 'other'],
    select: (value) => (value === 1 ? 'one' : 'other'),
  },
};

const FALLBACK = 'fr';

/** Règles d'une langue (celles du français si elle est inconnue). */
function rulesOf(language: string) {
  return CARDINAL_RULES[language] ?? (CARDINAL_RULES[FALLBACK] as (typeof CARDINAL_RULES)[string]);
}

function baseLanguage(locales?: string | readonly string[]): string {
  const list = typeof locales === 'string' ? [locales] : (locales ?? []);
  for (const locale of list) {
    const base = locale.toLowerCase().split(/[-_]/)[0] ?? '';
    if (base in CARDINAL_RULES) return base;
  }
  return FALLBACK;
}

/** Version réduite de `Intl.PluralRules` : ce dont i18next a besoin (`select`, `resolvedOptions`). */
export class PluralRules {
  private readonly language: string;
  private readonly type: 'cardinal' | 'ordinal';

  constructor(locales?: string | readonly string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    this.language = baseLanguage(locales);
    this.type = options?.type ?? 'cardinal';
  }

  select(value: number): Category {
    // Les ordinaux (« 1er, 2e ») ne servent pas dans l'application : catégorie unique.
    if (this.type === 'ordinal' || !Number.isFinite(value)) return 'other';
    return rulesOf(this.language).select(value);
  }

  resolvedOptions() {
    return {
      locale: this.language,
      type: this.type,
      pluralCategories:
        this.type === 'ordinal' ? ['other'] : [...rulesOf(this.language).categories],
    };
  }

  static supportedLocalesOf(locales: string | readonly string[]): string[] {
    const list = typeof locales === 'string' ? [locales] : [...locales];
    return list.filter((locale) => (locale.toLowerCase().split(/[-_]/)[0] ?? '') in CARDINAL_RULES);
  }
}

/** Installe la version réduite si le moteur n'a pas `Intl.PluralRules`. Renvoie vrai si installée. */
export function installPluralRules(target: { Intl?: unknown } = globalThis): boolean {
  const intl = (target.Intl ?? {}) as { PluralRules?: unknown };
  if (typeof intl.PluralRules === 'function') return false;
  Object.defineProperty(intl, 'PluralRules', {
    value: PluralRules,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  if (!target.Intl) target.Intl = intl;
  return true;
}

installPluralRules();
