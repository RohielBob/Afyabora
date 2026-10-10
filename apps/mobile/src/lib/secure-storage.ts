// Jetons d'authentification et session : stockage chiffré par le système (Keystore Android / Keychain iOS).
// Jamais dans AsyncStorage ni dans les logs. Version web (développement) : secure-storage.web.ts.
import * as SecureStore from 'expo-secure-store';

const ACCESS = 'glyka.accessToken';
const REFRESH = 'glyka.refreshToken';
const SESSION = 'glyka.session';

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS, accessToken);
  await SecureStore.setItemAsync(REFRESH, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}

/**
 * Informations de session (identifiant, rôle, profil complété) : permettent de rouvrir l'app HORS-LIGNE
 * sans redemander la connexion (ADR-0004). Aucune donnée de santé.
 */
export async function saveSessionInfo(json: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION, json);
}

export async function getSessionInfo(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION);
}

export async function clearSessionInfo(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION);
}
