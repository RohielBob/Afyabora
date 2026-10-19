// Version web de qr-storage.ts (aperçu dans le navigateur, développement uniquement) : SecureStore n'existe
// pas sur le web. Le jeton va dans sessionStorage : il disparaît à la fermeture de l'onglet.
// Sur téléphone, c'est qr-storage.ts (Keystore / Keychain) qui est utilisé, jamais ce fichier.
const KEY = 'glyka.emergencyQr';

export interface StoredQr {
  token: string;
  url: string;
}

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

const store = (): Storage | undefined => globalThis.sessionStorage;

export async function readStoredQr(userId: string): Promise<StoredQr | null> {
  return parseStoredQr(store()?.getItem(KEY) ?? null, userId);
}

export async function storeQr(userId: string, qr: StoredQr): Promise<void> {
  store()?.setItem(KEY, JSON.stringify({ userId, token: qr.token, url: qr.url }));
}

export async function clearStoredQr(): Promise<void> {
  store()?.removeItem(KEY);
}
