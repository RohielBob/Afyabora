// Client HTTP du portail (même principe que le mobile, L1-07).
// Toute erreur devient une ApiError : statut HTTP, code stable du serveur (ex. EMAIL_NOT_VERIFIED),
// secondes d'attente. Un problème de réseau (serveur injoignable, délai dépassé) a le statut 0.
// Le jeton d'accès vit EN MÉMOIRE seulement (jamais dans le stockage du navigateur).
import { API_URL } from './config';
import { noteServerDate } from './server-clock';

/** Délai maximum d'une requête : au-delà, on considère le serveur injoignable. */
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    /** Statut HTTP ; 0 = pas de réponse (réseau coupé, serveur arrêté, délai dépassé). */
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Code stable renvoyé par l'API (contrat : schéma Error.code), ex. ACCOUNT_LOCKED. */
  get code(): string | undefined {
    return (this.body as { code?: string } | undefined)?.code;
  }

  /** Secondes à attendre (compte verrouillé, trop de tentatives). */
  get retryAfterSeconds(): number | undefined {
    return (this.body as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
  }
}

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

/**
 * Renouvellement de session, fourni par la session (injection : le client HTTP ne dépend pas d'elle).
 * `true` = nouveaux jetons ; `false` = session terminée (l'écran de connexion s'affiche).
 */
export type TokenRefresher = () => Promise<boolean>;
let refresher: TokenRefresher | null = null;
export function setTokenRefresher(fn: TokenRefresher | null): void {
  refresher = fn;
}

export type ApiInit = Omit<RequestInit, 'body'> & { auth?: boolean; body?: unknown };

/**
 * Requête vers l'API. Si une route protégée répond 401 (jeton d'accès expiré, 15 min), la session est
 * renouvelée UNE fois puis la requête rejouée. Les routes publiques (`auth: false`) ne déclenchent
 * jamais de renouvellement (pas de boucle avec /auth/refresh).
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || init.auth === false || !refresher) {
      throw error;
    }
    if (!(await refresher())) throw error;
    return send<T>(path, init); // nouveau jeton : on rejoue une seule fois
  }
}

async function send<T>(path: string, init: ApiInit): Promise<T> {
  const { auth, body, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (auth !== false && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable');
  } finally {
    clearTimeout(timer);
  }

  noteServerDate(response.headers.get('Date')); // horloge du serveur (compte à rebours, L5-13)
  const data: unknown = await response.json().catch(() => undefined); // 204 : pas de corps
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data as { message?: string } | undefined)?.message ?? 'Erreur du serveur',
      data,
    );
  }
  return data as T;
}
