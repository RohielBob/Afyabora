// Client HTTP de l'application.
// Toute erreur devient une ApiError : statut HTTP, code stable du serveur (ex. EMAIL_NOT_VERIFIED),
// détail des champs invalides. Un problème de réseau (serveur injoignable, délai dépassé) a le statut 0.
import { API_URL } from './config';
import { getAccessToken } from './secure-storage';

/** Délai maximum d'une requête : au-delà, on considère le serveur injoignable (connexion faible). */
const TIMEOUT_MS = 15_000;

export interface ApiIssue {
  path: string;
  message: string;
}

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

  /** Champs refusés par la validation du serveur (réponses 400). */
  get issues(): ApiIssue[] {
    return (this.body as { issues?: ApiIssue[] } | undefined)?.issues ?? [];
  }

  /** Secondes à attendre (compte verrouillé, trop de tentatives). */
  get retryAfterSeconds(): number | undefined {
    return (this.body as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
  }
}

/**
 * Renouvellement de session (L1-07), fourni par la session au démarrage de l'app (injection : le client
 * HTTP ne dépend pas de la session). Résultat : jetons renouvelés, session expirée, ou serveur injoignable.
 */
export type TokenRefresher = () => Promise<'refreshed' | 'expired' | 'offline'>;
let refresher: TokenRefresher | null = null;
export function setTokenRefresher(fn: TokenRefresher | null): void {
  refresher = fn;
}

type ApiInit = Omit<RequestInit, 'body'> & { auth?: boolean; body?: unknown };

/**
 * Requête vers l'API. Si une route protégée répond 401 (jeton d'accès expiré, 15 min), la session est
 * renouvelée UNE fois puis la requête rejouée. Les routes publiques (`auth: false`) ne déclenchent jamais
 * de renouvellement (pas de boucle avec /auth/refresh).
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  try {
    return await send<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || init.auth === false || !refresher) {
      throw error;
    }
    const outcome = await refresher();
    if (outcome === 'offline') throw new ApiError(0, 'Serveur injoignable');
    if (outcome === 'expired') throw error; // la session est fermée : l'écran de connexion s'affiche
    return send<T>(path, init); // nouveau jeton : on rejoue une seule fois
  }
}

async function send<T>(path: string, init: ApiInit): Promise<T> {
  const { auth, body, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (auth !== false) {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

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
