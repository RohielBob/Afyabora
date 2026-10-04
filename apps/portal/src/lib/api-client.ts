// Client HTTP du portail. TODO(L1-11) : rafraîchissement du jeton, déconnexion sur 401.
import { API_URL } from './config';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, (body as { message?: string })?.message ?? 'Erreur réseau');
  return body as T;
}
