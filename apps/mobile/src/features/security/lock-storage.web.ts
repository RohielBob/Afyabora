// Version web (aperçu de développement) : sessionStorage, effacé à la fermeture de l'onglet.
const KEYS = {
  settings: 'glyka.lock.settings',
  pin: 'glyka.lock.pin',
  attempts: 'glyka.lock.attempts',
} as const;
export type LockKey = keyof typeof KEYS;

const store = (): Storage | undefined => globalThis.sessionStorage;

export async function readLock(key: LockKey): Promise<string | null> {
  return store()?.getItem(KEYS[key]) ?? null;
}

export async function writeLock(key: LockKey, value: string): Promise<void> {
  store()?.setItem(KEYS[key], value);
}

export async function clearLock(): Promise<void> {
  Object.values(KEYS).forEach((k) => store()?.removeItem(k));
}
