// Version web (aperçu dans le navigateur) : le localStorage du navigateur suffit.
const KEY = 'glyka.appearance';

export function readAppearance(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeAppearance(value: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // navigation privée : sans gravité
  }
}
