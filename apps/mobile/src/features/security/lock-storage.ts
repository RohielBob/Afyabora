// Stockage du verrouillage dans le coffre sécurisé du téléphone (Keystore / Keychain).
// Version web (développement) : lock-storage.web.ts.
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  settings: 'glyka.lock.settings',
  pin: 'glyka.lock.pin',
  attempts: 'glyka.lock.attempts',
} as const;
export type LockKey = keyof typeof KEYS;

export function readLock(key: LockKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export function writeLock(key: LockKey, value: string): Promise<void> {
  return SecureStore.setItemAsync(KEYS[key], value);
}

export async function clearLock(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
}
