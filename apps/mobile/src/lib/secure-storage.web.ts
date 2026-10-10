// Version web (aperçu dans le navigateur, développement uniquement) : SecureStore n'existe pas sur le web.
// Les jetons vont dans sessionStorage : ils disparaissent à la fermeture de l'onglet.
// Sur téléphone, c'est secure-storage.ts (Keystore / Keychain) qui est utilisé, jamais ce fichier.
const ACCESS = 'glyka.accessToken';
const REFRESH = 'glyka.refreshToken';
const SESSION = 'glyka.session';

const store = (): Storage | undefined => globalThis.sessionStorage;

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  store()?.setItem(ACCESS, accessToken);
  store()?.setItem(REFRESH, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return store()?.getItem(ACCESS) ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return store()?.getItem(REFRESH) ?? null;
}

export async function clearTokens(): Promise<void> {
  store()?.removeItem(ACCESS);
  store()?.removeItem(REFRESH);
}

export async function saveSessionInfo(json: string): Promise<void> {
  store()?.setItem(SESSION, json);
}

export async function getSessionInfo(): Promise<string | null> {
  return store()?.getItem(SESSION) ?? null;
}

export async function clearSessionInfo(): Promise<void> {
  store()?.removeItem(SESSION);
}
