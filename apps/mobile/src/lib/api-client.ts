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

/**
 * `body` : objet envoyé en JSON, ou `FormData` envoyé tel quel (multipart : fichier d'import, L4-05).
 * `timeoutMs` : délai propre à la requête (un fichier de 5 Mo peut dépasser 15 s sur une connexion lente).
 */
type ApiInit = Omit<RequestInit, 'body'> & { auth?: boolean; body?: unknown; timeoutMs?: number };

/**
 * Requête vers l'API. Si une route protégée répond 401 (jeton d'accès expiré, 15 min), la session est
 * renouvelée UNE fois puis la requête rejouée. Les routes publiques (`auth: false`) ne déclenchent jamais
 * de renouvellement (pas de boucle avec /auth/refresh).
 */
export function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return withRefresh(init, () =>
    send(
      path,
      init,
      'application/json',
      async (response) => (await response.json().catch(() => undefined)) as T, // 204 : pas de corps
    ),
  );
}

/** Fichier reçu de l'API (rapport PDF, L6-03) : son contenu et les en-têtes de la réponse. */
export interface ApiFile {
  bytes: Uint8Array;
  headers: Headers;
}

/**
 * Téléchargement d'un fichier (L6-03) : mêmes règles que `api` (jeton, renouvellement de session, délai,
 * erreurs en ApiError avec le code du serveur), mais la réponse est lue en octets. Le délai couvre aussi
 * la réception du fichier : une connexion qui se coupe au milieu devient « serveur injoignable ».
 */
export function apiFile(path: string, init: Omit<ApiInit, 'body'> = {}): Promise<ApiFile> {
  return withRefresh(init, () =>
    send(path, init, 'application/pdf, application/json', async (response) => ({
      bytes: new Uint8Array(await response.arrayBuffer()),
      headers: response.headers,
    })),
  );
}

/** Lance `run` ; si la route protégée répond 401, renouvelle la session puis le relance UNE fois. */
async function withRefresh<T>(init: ApiInit, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || init.auth === false || !refresher) {
      throw error;
    }
    const outcome = await refresher();
    if (outcome === 'offline') throw new ApiError(0, 'Serveur injoignable');
    if (outcome === 'expired') throw error; // la session est fermée : l'écran de connexion s'affiche
    return run(); // nouveau jeton : on rejoue une seule fois
  }
}

/**
 * Une requête : en-têtes, jeton, délai. Une réponse en erreur devient une ApiError (corps JSON du
 * serveur) ; sinon `read` lit le corps (JSON ou octets) PENDANT le délai : un corps qui n'arrive jamais
 * ne bloque pas l'écran.
 */
async function send<T>(
  path: string,
  init: ApiInit,
  accept: string,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { auth, body, timeoutMs = TIMEOUT_MS, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', accept);
  // Multipart : PAS de Content-Type à la main, le navigateur / React Native ajoute la frontière (boundary).
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
  if (auth !== false) {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers,
        body:
          body === undefined ? undefined : multipart ? (body as FormData) : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'Serveur injoignable');
    }

    if (!response.ok) {
      const data: unknown = await response.json().catch(() => undefined);
      throw new ApiError(
        response.status,
        (data as { message?: string } | undefined)?.message ?? 'Erreur du serveur',
        data,
      );
    }
    try {
      return await read(response);
    } catch {
      throw new ApiError(0, 'Serveur injoignable'); // corps coupé en route ou délai dépassé
    }
  } finally {
    clearTimeout(timer);
  }
}
