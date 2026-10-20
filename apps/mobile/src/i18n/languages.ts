// Langues de l'application (choix dans Réglages → Langue). La LOGIQUE, sans téléphone (testée dans
// src/i18n/__tests__/languages.test.ts).
//  - Par défaut (« Langue du téléphone ») : la langue du téléphone si l'application la connaît, sinon le
//    français (langue de référence : tous les textes sont d'abord écrits en français).
//  - `reviewed` : traduction relue par une personne qui parle la langue. Tant que ce n'est pas le cas, le
//    choix affiche « traduction en relecture » (des messages de santé sont concernés : seuils, alertes,
//    carte d'urgence). À passer à `true` dans la PR qui note la relecture.

export const LANGUAGES = [
  { code: 'fr', nativeName: 'Français', reviewed: true },
  { code: 'en', nativeName: 'English', reviewed: true },
  { code: 'es', nativeName: 'Español', reviewed: false },
  { code: 'pt', nativeName: 'Português', reviewed: false },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
/** Choix enregistré : une langue, ou « suivre le téléphone ». */
export type LanguagePreference = LanguageCode | 'system';

export const DEFAULT_LANGUAGE: LanguageCode = 'fr';

const CODES: readonly string[] = LANGUAGES.map((language) => language.code);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && CODES.includes(value);
}

/** Relit le choix enregistré ; absent ou inconnu (ex. langue retirée) ⇒ « suivre le téléphone ». */
export function parsePreference(raw: string | null): LanguagePreference {
  return isLanguageCode(raw) ? raw : 'system';
}

/**
 * Langue à afficher. `deviceLanguages` : codes des langues du téléphone, dans l'ordre de préférence
 * (ex. ['pt', 'fr']) ; on prend la PREMIÈRE que l'application connaît.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguages: readonly (string | null | undefined)[],
): LanguageCode {
  if (preference !== 'system') return preference;
  for (const code of deviceLanguages) {
    const base = code?.toLowerCase().split(/[-_]/)[0];
    if (isLanguageCode(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

export function languageInfo(code: LanguageCode) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}
