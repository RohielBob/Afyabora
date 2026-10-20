// Langue du portail. Toutes les pages lisent leurs textes dans `texts` (jamais de texte en dur), et leurs
// dates avec `dateLocale()`. Pas de bibliothèque d'i18n (aucune nouvelle dépendance) :
//  - `fr.ts` est la langue de référence ; chaque autre langue (en.ts, es.ts…) a le type `Messages` :
//    TypeScript refuse une traduction à laquelle il manque un texte, ou qui en a un de trop ;
//  - `texts` est un objet « vivant » : `texts.login.title` donne TOUJOURS le texte de la langue affichée,
//    même gardé dans une constante (`const t = texts.record.glucose`) ;
//  - au changement de langue, src/main.tsx redessine tout le portail (le dossier ouvert, la session et le
//    cache des données sont gardés) ;
//  - le choix est gardé dans le navigateur (`localStorage`, clé `glyka.portal.language`) : un réglage
//    d'affichage, sans donnée patient. Stockage bloqué ⇒ le choix vaut pour l'onglet seulement.
import { useSyncExternalStore } from 'react';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { kg } from './kg';
import {
  formatLocale,
  parsePreference,
  resolveLanguage,
  type LanguageCode,
  type LanguagePreference,
} from './languages';
import { ln } from './ln';
import { lua } from './lua';
import { pt } from './pt';
import { sw } from './sw';

export * from './languages';
export { fill } from './fr';

/** Forme des textes : celle du français, avec des textes libres (pas les mots exacts du français). */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { readonly [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof fr>;

export const MESSAGES: Record<LanguageCode, Messages> = { fr, en, es, pt, ln, sw, kg, lua };

// ---------- Choix de la langue ----------

export const STORAGE_KEY = 'glyka.portal.language';
type Listener = () => void;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  try {
    return navigator.languages?.length ? navigator.languages : [navigator.language];
  } catch {
    return [];
  }
}

function readPreference(): LanguagePreference {
  try {
    return parsePreference(storage()?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

let preference: LanguagePreference | null = null;
const listeners = new Set<Listener>();

/** Choix enregistré (une langue, ou « langue du navigateur »). */
export function getLanguagePreference(): LanguagePreference {
  preference ??= readPreference();
  return preference;
}

/** Langue que donnerait « Langue du navigateur » (affichée à côté de ce choix dans le menu). */
export function browserLanguage(): LanguageCode {
  return resolveLanguage('system', browserLanguages());
}

/** Langue affichée. */
export function getLanguage(): LanguageCode {
  return resolveLanguage(getLanguagePreference(), browserLanguages());
}

/** Change la langue tout de suite (le portail se redessine) et la garde dans le navigateur. */
export function setLanguagePreference(next: LanguagePreference): void {
  preference = next;
  try {
    storage()?.setItem(STORAGE_KEY, next);
  } catch {
    // Stockage plein ou bloqué : le choix reste valable pour cet onglet.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Langue affichée, pour un composant (se met à jour quand elle change). */
export function useLanguage(): LanguageCode {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}

/** Choix enregistré, pour le menu (se met à jour quand il change). */
export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(subscribeLanguage, getLanguagePreference, getLanguagePreference);
}

/** Langue pour écrire dates et nombres (français si le navigateur ne connaît pas la langue). */
export function dateLocale(): string {
  return formatLocale(getLanguage());
}

// ---------- Textes « vivants » ----------

type TextNode = Record<PropertyKey, unknown>;
const isNode = (value: unknown): value is TextNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function nodeAt(root: Messages, path: readonly PropertyKey[]): TextNode {
  let node: unknown = root;
  for (const key of path) node = (node as TextNode)[key];
  return node as TextNode;
}

const proxies = new Map<string, TextNode>();

/**
 * Objet qui lit, à chaque accès, le texte de la langue affichée. Les sous-parties (`texts.record`) sont
 * elles aussi vivantes ; un texte ou une liste est renvoyé tel quel. La cible est la partie française
 * (mêmes clés dans toutes les langues), ce qui garde `Object.keys`/`Object.entries` justes.
 */
function live(path: readonly PropertyKey[]): TextNode {
  const id = path.map(String).join('.');
  const cached = proxies.get(id);
  if (cached) return cached;
  const target = nodeAt(fr, path);
  const current = () => nodeAt(MESSAGES[getLanguage()], path);
  const proxy = new Proxy(target, {
    get(_target, key) {
      const value = current()[key];
      return isNode(value) ? live([...path, key]) : value;
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (descriptor && 'value' in descriptor) {
        const value = current()[key];
        descriptor.value = isNode(value) ? live([...path, key]) : value;
      }
      return descriptor;
    },
  });
  proxies.set(id, proxy);
  return proxy;
}

/** Textes de la langue affichée (même forme que `fr`). */
export const texts = live([]) as unknown as Messages;

/**
 * À appeler une fois au démarrage (src/main.tsx) : `lang` de la page et titre de l'onglet suivent la langue
 * (les lecteurs d'écran prononcent alors le texte correctement). Renvoie la fonction d'arrêt.
 */
export function startLanguage(doc: Document = document): () => void {
  const apply = () => {
    doc.documentElement.lang = getLanguage();
    doc.title = `${texts.app.name} — ${texts.app.space}`;
  };
  apply();
  return subscribeLanguage(apply);
}
