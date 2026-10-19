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
export function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return withRefresh(init, () =>
    send(
      path,
      init,
      'application/json',
      TIMEOUT_MS,
      async (response) => (await response.json().catch(() => undefined)) as T, // 204 : pas de corps
    ),
  );
}

/** Un rapport de 90 jours sur une connexion lente : plus long qu'une lecture ordinaire. */
export const FILE_TIMEOUT_MS = 60_000;

/**
 * Téléchargement d'un fichier (rapport PDF, L6-04) : mêmes règles que `api` (jeton, renouvellement de
 * session, erreurs en ApiError avec le code du serveur), mais la réponse est lue en octets. Le délai
 * couvre aussi la réception : une connexion coupée au milieu devient « serveur injoignable ».
 */
export function apiFile(path: string): Promise<Uint8Array> {
  return withRefresh({}, () =>
    send(
      path,
      {},
      'application/pdf, application/json',
      FILE_TIMEOUT_MS,
      async (response) => new Uint8Array(await response.arrayBuffer()),
    ),
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
    if (!(await refresher())) throw error;
    return run(); // nouveau jeton : on rejoue une seule fois
  }
}

/**
 * Une requête : en-têtes, jeton, délai. Une réponse en erreur devient une ApiError (corps JSON du
 * serveur) ; sinon `read` lit le corps (JSON ou octets) PENDANT le délai.
 */
async function send<T>(
  path: string,
  init: ApiInit,
  accept: string,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { auth, body, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', accept);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (auth !== false && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
    }

    noteServerDate(response.headers.get('Date')); // horloge du serveur (compte à rebours, L5-13)
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
