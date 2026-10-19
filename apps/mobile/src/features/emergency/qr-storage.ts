// Jeton du QR d'urgence, gardé sur le téléphone (L6-06) : le serveur n'en garde que l'empreinte, c'est donc
// le seul endroit où l'application peut le relire pour réafficher le QR. Stockage CHIFFRÉ par le système
// (Keystore Android / Keychain iOS), jamais dans les logs.
//  - Lié au compte : un autre compte connecté sur le même téléphone ne le voit pas.
//  - Effacé à la déconnexion (le QR imprimé, lui, continue de marcher : seul le patient peut le désactiver).
// Version web (aperçu de développement) : qr-storage.web.ts.
import * as SecureStore from 'expo-secure-store';

const KEY = 'glyka.emergencyQr';

export interface StoredQr {
  token: string;
  url: string;
}

/** Contenu lu : seulement s'il appartient à ce compte et a la bonne forme. */
export function parseStoredQr(raw: string | null, userId: string): StoredQr | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { userId?: unknown; token?: unknown; url?: unknown };
    if (value.userId !== userId) return null;
    if (typeof value.token !== 'string' || typeof value.url !== 'string') return null;
    return { token: value.token, url: value.url };
  } catch {
    return null;
  }
}

export async function readStoredQr(userId: string): Promise<StoredQr | null> {
  return parseStoredQr(await SecureStore.getItemAsync(KEY), userId);
}

export async function storeQr(userId: string, qr: StoredQr): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ userId, token: qr.token, url: qr.url }));
}

export async function clearStoredQr(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
