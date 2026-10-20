// Version web (aperçu dans le navigateur) : le localStorage du navigateur suffit.
const KEY = 'glyka.language';

export function readLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLanguage(value: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // navigation privée : sans gravité
  }
}
