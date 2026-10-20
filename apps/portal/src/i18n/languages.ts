// Langues du portail : mêmes 8 langues, mêmes règles que l'application mobile
// (apps/mobile/src/i18n/languages.ts). La LOGIQUE, sans navigateur (testée dans
// src/i18n/__tests__/languages.test.ts).
//  - Par défaut (« Langue du navigateur ») : la première langue du navigateur que le portail connaît, sinon
//    le français (langue de référence : chaque texte est d'abord écrit en français, dans fr.ts).
//  - `reviewed` : traduction relue par une personne qui parle la langue. Tant que ce n'est pas le cas, le
//    menu affiche « traduction en relecture ». À passer à `true` dans la PR qui note la relecture.

export const LANGUAGES = [
  { code: 'fr', nativeName: 'Français', reviewed: true },
  { code: 'en', nativeName: 'English', reviewed: true },
  { code: 'es', nativeName: 'Español', reviewed: false },
  { code: 'pt', nativeName: 'Português', reviewed: false },
  // Langues de la RD Congo : mêmes choix d'écriture que le mobile (lingala de Kinshasa sans ɛ/ɔ,
  // kiswahili standard, kikongo ya leta, ciluba).
  { code: 'ln', nativeName: 'Lingála', reviewed: false },
  { code: 'sw', nativeName: 'Kiswahili', reviewed: false },
  { code: 'kg', nativeName: 'Kikongo', reviewed: false },
  { code: 'lua', nativeName: 'Tshiluba', reviewed: false },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
/** Choix enregistré : une langue, ou « suivre le navigateur ». */
export type LanguagePreference = LanguageCode | 'system';

export const DEFAULT_LANGUAGE: LanguageCode = 'fr';

const CODES: readonly string[] = LANGUAGES.map((language) => language.code);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && CODES.includes(value);
}

/** Relit le choix enregistré ; absent ou inconnu (ex. langue retirée) ⇒ « suivre le navigateur ». */
export function parsePreference(raw: string | null): LanguagePreference {
  return isLanguageCode(raw) ? raw : 'system';
}

/**
 * Langue à afficher. `browserLanguages` : langues du navigateur, dans l'ordre de préférence
 * (`navigator.languages`, ex. ['pt-BR', 'fr']) ; on prend la PREMIÈRE que le portail connaît.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  browserLanguages: readonly (string | null | undefined)[],
): LanguageCode {
  if (preference !== 'system') return preference;
  for (const code of browserLanguages) {
    const base = code?.toLowerCase().split(/[-_]/)[0];
    if (isLanguageCode(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

export function languageInfo(code: LanguageCode) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

/** Langue de secours pour les dates et les nombres : celle du pays (RD Congo), comprise par tous. */
const FORMAT_FALLBACK = 'fr';

/**
 * Langue à utiliser pour écrire les DATES et les NOMBRES (toLocaleDateString…). Le moteur ne connaît pas
 * toutes les langues (kikongo, tshiluba…) : il prendrait alors la langue par défaut du navigateur, parfois
 * l'anglais (« October »). Dans ce cas, on écrit dates et nombres en français. Même règle que le mobile.
 */
export function formatLocale(
  code: string,
  supported: (code: string) => boolean = (c) =>
    Intl.DateTimeFormat.supportedLocalesOf([c]).length > 0,
): string {
  try {
    return supported(code) ? code : FORMAT_FALLBACK;
  } catch {
    return FORMAT_FALLBACK;
  }
}
