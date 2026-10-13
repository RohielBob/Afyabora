// Session mobile (L1-06 connexion, L1-07 session) : état connecté / déconnecté partagé par toute l'app.
//
// Principes (ADR-0004, local-first) :
//  - au démarrage, une session enregistrée est rouverte TOUT DE SUITE, même sans réseau ; elle est
//    renouvelée en arrière-plan, et fermée seulement si le serveur la refuse ;
//  - jeton d'accès expiré (15 min) → renouvellement automatique, UN SEUL à la fois (deux renouvellements
//    en parallèle seraient vus par le serveur comme un vol de session, voir L1-02) ;
//  - déconnexion : session révoquée côté serveur si possible, puis jetons ET base locale effacés ; le
//    moteur de synchronisation est arrêté AVANT (L8-06) : il ne peut plus rien écrire dans la base.
import type { AuthTokens, DoctorVerificationStatus, UserRole } from '@glyka/shared';
import { useSyncExternalStore } from 'react';
import { claimLocalData, wipeLocalData } from '@/db/reset';
import { requestSync, stopSync, syncNow } from '@/features/sync';
import { ApiError, api, setTokenRefresher } from '@/lib/api-client';
import {
  clearSessionInfo,
  clearTokens,
  getRefreshToken,
  getSessionInfo,
  saveSessionInfo,
  saveTokens,
} from '@/lib/secure-storage';
import type { LoginResponse } from './api';

export interface SessionUser {
  id: string;
  role: UserRole;
  profileCompleted: boolean;
  doctorVerificationStatus: DoctorVerificationStatus | null;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; reason?: 'expired' | 'signedOut' }
  | { status: 'signedIn'; user: SessionUser };

export type LoginDestination = 'onboarding' | 'home' | 'notPatient';

/** Dernier essai d'envoi à la déconnexion : au-delà, on se déconnecte quand même (bouton toujours réactif). */
const SIGN_OUT_SYNC_MS = 5_000;

// ---------- Petit magasin d'état observable (sans dépendance) ----------
let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSession(): SessionState {
  return state;
}

/** État de session pour un écran : il se redessine à chaque connexion / déconnexion. */
export function useSession(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

// ---------- Renouvellement des jetons (un seul à la fois) ----------
let inFlight: Promise<'refreshed' | 'expired' | 'offline'> | null = null;

export function refreshSession(): Promise<'refreshed' | 'expired' | 'offline'> {
  // Si un renouvellement est déjà en cours, on attend le même résultat au lieu d'en lancer un second.
  inFlight ??= doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<'refreshed' | 'expired' | 'offline'> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await endSession('expired');
    return 'expired';
  }
  try {
    const tokens = await api<AuthTokens>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    });
    await saveTokens(tokens.accessToken, tokens.refreshToken);
    return 'refreshed';
  } catch (error) {
    // 400/401 : jeton refusé (expiré, révoqué, réutilisé) → la session est terminée.
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      await endSession('expired');
      return 'expired';
    }
    // Réseau coupé, serveur en panne : on garde la session (on réessaiera plus tard).
    return 'offline';
  }
}

// Le client HTTP appelle ce renouvellement quand une route protégée répond 401.
setTokenRefresher(refreshSession);

// ---------- Cycle de vie ----------

/** Au démarrage de l'app : rouvre la session enregistrée (même hors-ligne), puis la renouvelle. */
export async function initSession(): Promise<void> {
  const [refreshToken, savedUser] = await Promise.all([getRefreshToken(), getSessionInfo()]);
  const user = parseUser(savedUser);
  if (!refreshToken || !user) {
    await clearAll();
    setState({ status: 'signedOut' });
    return;
  }
  setState({ status: 'signedIn', user });
  void refreshSession(); // en arrière-plan : n'empêche pas d'utiliser l'app hors-ligne
}

/**
 * Après une connexion réussie. L'application mobile est réservée aux patients : un compte médecin ou
 * administrateur est orienté vers le portail et AUCUN jeton n'est conservé sur le téléphone.
 */
export async function signIn(response: LoginResponse): Promise<LoginDestination> {
  if (response.user.role !== 'PATIENT') {
    await clearAll();
    return 'notPatient';
  }
  // Données locales d'un AUTRE compte (session expirée sans déconnexion) : arrêtées puis effacées avant
  // tout ; celles du même compte sont gardées, file d'envoi comprise (ADR-0004, modifications 3 et 6).
  await stopSync();
  await claimLocalData(response.user.id);
  await saveTokens(response.accessToken, response.refreshToken);
  await saveSessionInfo(JSON.stringify(response.user));
  setState({ status: 'signedIn', user: response.user });
  requestSync(); // envoie ce qui attendait, puis reçoit les données du compte (nouveau téléphone : tout)
  return response.user.profileCompleted ? 'home' : 'onboarding';
}

/** Le profil médical vient d'être créé (assistant L1-08) : l'accueil devient accessible. */
export async function markProfileCompleted(): Promise<void> {
  if (state.status !== 'signedIn') return;
  const user = { ...state.user, profileCompleted: true };
  await saveSessionInfo(JSON.stringify(user));
  setState({ status: 'signedIn', user });
}

/**
 * Déconnexion volontaire : révoque la session côté serveur (si le réseau le permet), puis efface les
 * jetons et TOUTES les données locales. Les modifications non synchronisées sont perdues : l'écran
 * prévient avant (countUnsyncedChanges).
 */
export async function signOut(): Promise<void> {
  // ADR-0004, modification 3 : dernier essai d'envoi (5 s au plus) TANT QUE la session est valide, puis
  // arrêt du moteur ; la base n'est effacée qu'ensuite.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    syncNow(),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(undefined), SIGN_OUT_SYNC_MS);
    }),
  ]);
  clearTimeout(timer);
  await stopSync();
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await api<void>('/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // Hors-ligne ou session déjà expirée : on se déconnecte quand même sur le téléphone.
    }
  }
  await wipeLocalData();
  await endSession('signedOut');
}

async function endSession(reason: 'expired' | 'signedOut') {
  await clearAll();
  setState({ status: 'signedOut', reason });
}

async function clearAll() {
  await clearTokens();
  await clearSessionInfo();
}

function parseUser(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as Partial<SessionUser>;
    if (typeof user.id !== 'string' || user.role !== 'PATIENT') return null;
    return {
      id: user.id,
      role: user.role,
      profileCompleted: user.profileCompleted === true,
      doctorVerificationStatus: user.doctorVerificationStatus ?? null,
    };
  } catch {
    return null;
  }
}

/** @internal Réservé aux tests : remet la session à zéro entre deux tests. */
export function __resetSessionForTests() {
  state = { status: 'loading' };
  inFlight = null;
}
