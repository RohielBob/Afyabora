// Client HTTP minimal. TODO(L1-07) : rafraîchissement automatique du jeton sur réponse 401.
import { API_URL } from './config';
import { getAccessToken } from './secure-storage';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.auth !== false) {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body as { message?: string })?.message ?? 'Erreur réseau',
      body,
    );
  }
  return body as T;
}
