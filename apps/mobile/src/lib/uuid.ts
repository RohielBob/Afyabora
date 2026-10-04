import * as Crypto from 'expo-crypto';

/** Identifiant généré sur l'appareil : fonctionne hors-ligne et rend la synchronisation idempotente. */
export function newId(): string {
  return Crypto.randomUUID();
}
