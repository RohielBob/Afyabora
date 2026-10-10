// Session du médecin sur le portail (L1-11).
//
// Où sont les jetons :
//  - jeton d'accès (15 min) : EN MÉMOIRE seulement (lib/api-client.ts) ;
//  - jeton de rafraîchissement + rôle/statut : `sessionStorage` de l'ONGLET (pas `localStorage`) : la
//    session survit à un rechargement de page, mais disparaît quand l'onglet ou le navigateur est fermé.
//    C'est le bon compromis pour un poste de consultation partagé (pas de « rester connecté » des jours).
//  - aucune donnée patient n'est jamais enregistrée dans le navigateur (README du portail).
//
// Protections :
//  - un seul renouvellement à la fois (deux en parallèle seraient vus comme un vol de session, L1-02) ;
//  - déconnexion automatique après 30 minutes sans activité (IDLE_LIMIT_MS) ;
//  - un compte patient ou admin qui se connecte ici n'obtient pas de session : ses jetons sont révoqués
//    tout de suite côté serveur.
import { useSyncExternalStore } from 'react';
import { ApiError, setAccessToken, setTokenRefresher } from '@/lib/api-client';
import { authApi } from './api';
import {
  IDLE_LIMIT_MS,
  destinationFor,
  parseStoredSession,
  type Destination,
  type PortalUser,
  type StoredSession,
} from './rules';

const STORAGE_KEY = 'glyka.portal.session';

/** Pourquoi la personne n'est pas (ou plus) connectée : sert au message de l'écran de connexion. */
export type SignedOutReason = 'none' | 'signedOut' | 'expired' | 'idle';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; reason: SignedOutReason }
  | { status: 'signedIn'; user: PortalUser };

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();
let refreshInFlight: Promise<boolean> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// Le client HTTP renouvelle la session via cette fonction dès que ce module est chargé (pas seulement
// après initSession) : une requête protégée qui reçoit 401 est toujours rejouée une fois.
setTokenRefresher(() => refreshSession());

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** État de la session dans un composant React (se met à jour tout seul). */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

// ---------- Stockage de l'onglet ----------

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // navigation privée stricte, stockage bloqué : la session vit en mémoire seulement
  }
}

function readStored(): StoredSession | null {
  return parseStoredSession(storage()?.getItem(STORAGE_KEY) ?? null, Date.now());
}

function writeStored(session: StoredSession) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Stockage plein ou bloqué : la session continue en mémoire, elle ne survivra pas au rechargement.
  }
}

function clearStored() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire
  }
}

// ---------- Démarrage ----------

/**
 * Au chargement du portail : reprend la session de l'onglet s'il y en a une (renouvelle les jetons).
 * À appeler une seule fois (src/main.tsx).
 */
export async function initSession(): Promise<void> {
  const stored = readStored();
  if (!stored) {
    clearStored();
    setState({ status: 'signedOut', reason: 'none' });
    return;
  }
  setState({ status: 'signedIn', user: stored.user });
  startIdleWatch();
  await refreshSession(); // nouveau jeton d'accès ; en cas de refus, retour à la connexion
}

// ---------- Connexion / déconnexion ----------

/** Résultat d'une connexion réussie : la page à ouvrir (ou le refus si ce n'est pas un médecin). */
export async function signIn(email: string, password: string): Promise<Destination> {
  const normalized = email.trim().toLowerCase();
  const response = await authApi.login({ email: normalized, password });
  const user: PortalUser = {
    id: response.user.id,
    role: response.user.role,
    status: response.user.doctorVerificationStatus ?? null,
    email: normalized,
  };
  const destination = destinationFor(user);
  if (destination === 'notDoctor') {
    // Pas de session pour un patient ou un admin : on ferme tout de suite celle que le serveur a ouverte.
    await authApi.logout(response.refreshToken, response.accessToken).catch(() => undefined);
    return destination;
  }
  setAccessToken(response.accessToken);
  writeStored({ refreshToken: response.refreshToken, user, lastActive: Date.now() });
  setState({ status: 'signedIn', user });
  startIdleWatch();
  return destination;
}

/** Déconnexion volontaire (ou automatique) : session révoquée côté serveur si possible, tout est effacé. */
export async function signOut(reason: SignedOutReason = 'signedOut'): Promise<void> {
  const stored = readStored();
  if (stored) await authApi.logout(stored.refreshToken).catch(() => undefined);
  endSession(reason);
}

function endSession(reason: SignedOutReason) {
  stopIdleWatch();
  setAccessToken(null);
  clearStored();
  setState({ status: 'signedOut', reason });
}

// ---------- Renouvellement ----------

/**
 * Nouveaux jetons à partir du jeton de rafraîchissement. Un seul renouvellement à la fois : les appels
 * simultanés attendent le même. `false` = session terminée (refusée par le serveur).
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const stored = readStored();
  if (!stored) {
    if (state.status === 'signedIn') endSession('expired');
    return false;
  }
  try {
    const tokens = await authApi.refresh(stored.refreshToken);
    setAccessToken(tokens.accessToken);
    writeStored({ ...stored, refreshToken: tokens.refreshToken });
    return true;
  } catch (error) {
    // Serveur injoignable : on garde la session (la prochaine requête réessaiera).
    if (error instanceof ApiError && error.status === 0) return false;
    endSession('expired'); // jeton refusé (expiré, révoqué, réutilisé) : il faut se reconnecter
    return false;
  }
}

// ---------- Inactivité ----------

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const;

function onActivity() {
  const stored = readStored();
  if (!stored) return;
  // Écrit au plus une fois par minute (inutile de réécrire à chaque touche).
  if (Date.now() - stored.lastActive > 60_000) writeStored({ ...stored, lastActive: Date.now() });
  armIdleTimer();
}

function armIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void signOut('idle'), IDLE_LIMIT_MS);
}

function startIdleWatch() {
  if (typeof window === 'undefined') return;
  ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
  armIdleTimer();
}

function stopIdleWatch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (typeof window === 'undefined') return;
  ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
}

/** @internal Réservé aux tests : remet la session à zéro. */
export function __resetSessionForTests() {
  stopIdleWatch();
  state = { status: 'loading' };
  refreshInFlight = null;
  setAccessToken(null);
}
