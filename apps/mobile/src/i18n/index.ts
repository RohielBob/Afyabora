// Textes de l'application dans chaque langue (Réglages → Langue). Les textes ne sont JAMAIS écrits en dur
// dans les écrans : tout passe par ces fichiers. Le français est la langue de référence (et de secours :
// une clé absente d'une traduction s'affiche en français, jamais vide).
// En PREMIER : règles du pluriel absentes des téléphones Android (voir intl-polyfill.ts).
import './intl-polyfill';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import kg from './kg.json';
import { readLanguage, writeLanguage } from './language-storage';
import { parsePreference, resolveLanguage, type LanguagePreference } from './languages';
import ln from './ln.json';
import lua from './lua.json';
import pt from './pt.json';
import sw from './sw.json';

export * from './languages';

const deviceLanguages = () => getLocales().map((locale) => locale.languageCode);

let preference: LanguagePreference = parsePreference(readLanguage());
const listeners = new Set<() => void>();

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
    ln: { translation: ln },
    sw: { translation: sw },
    kg: { translation: kg },
    lua: { translation: lua },
  },
  lng: resolveLanguage(preference, deviceLanguages()),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

/** Choix enregistré (une langue, ou « langue du téléphone »). */
export function getLanguagePreference(): LanguagePreference {
  return preference;
}

/** Change la langue tout de suite (tous les écrans se redessinent) et la garde pour les prochains lancements. */
export async function setLanguagePreference(next: LanguagePreference): Promise<void> {
  preference = next;
  writeLanguage(next);
  listeners.forEach((listener) => listener());
  await i18n.changeLanguage(resolveLanguage(next, deviceLanguages()));
}

/** Choix enregistré, pour l'écran Réglages → Langue (se met à jour quand il change). */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference,
    () => preference,
  );
}

export default i18n;
