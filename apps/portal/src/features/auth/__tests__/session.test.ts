// Ticket L1-11 : session du médecin sur le portail, avec un faux serveur (fetch simulé) et un faux
// stockage d'onglet. Vérifie où vont les jetons, le refus des comptes patients, le renouvellement
// unique et la fin de session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getAccessToken } from '@/lib/api-client';
import {
  __resetSessionForTests,
  getSession,
  initSession,
  refreshSession,
  signIn,
  signOut,
} from '../session';

const KEY = 'glyka.portal.session';

/** Faux `sessionStorage` + `window` minimal (les tests tournent sous Node, sans navigateur). */
function fakeWindow() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('window', {
    sessionStorage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  return store;
}

type Handler = (body: Record<string, unknown>, headers: Headers) => [number, unknown];

/** Faux serveur : une réponse par route, et la liste des appels reçus. */
function fakeServer(routes: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown>; auth: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const headers = new Headers(init.headers);
      calls.push({ path, body, auth: headers.get('Authorization') });
      const handler = routes[path];
      const [status, data] = handler ? handler(body, headers) : [404, { message: 'inconnu' }];
      return new Response(data === undefined ? null : JSON.stringify(data), { status });
    }),
  );
  return calls;
}

const loginAs =
  (role: string, status: string | null): Handler =>
  () => [
    200,
    {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 900,
      user: { id: 'u1', role, profileCompleted: false, doctorVerificationStatus: status },
    },
  ];

let store: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  store = fakeWindow();
  __resetSessionForTests();
});

afterEach(() => {
  __resetSessionForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connexion', () => {
  it('médecin en attente : session ouverte, page « en attente », jeton d’accès en mémoire seulement', async () => {
    fakeServer({ '/auth/login': loginAs('DOCTOR', 'PENDING') });
    await expect(signIn(' Dr@Ex.org ', 'secret')).resolves.toBe('pending');

    const saved = JSON.parse(store.get(KEY) ?? '{}');
    expect(saved.refreshToken).toBe('refresh-1');
    expect(saved.user).toEqual({ id: 'u1', role: 'DOCTOR', status: 'PENDING', email: 'dr@ex.org' });
    expect(JSON.stringify(saved)).not.toContain('access-1'); // jamais dans le stockage
    expect(getAccessToken()).toBe('access-1');
    expect(getSession()).toMatchObject({ status: 'signedIn' });
  });

  it('compte patient : refusé, aucune session gardée, jetons révoqués tout de suite', async () => {
    const calls = fakeServer({
      '/auth/login': loginAs('PATIENT', null),
      '/auth/logout': () => [204, undefined],
    });
    await expect(signIn('patient@ex.org', 'secret')).resolves.toBe('notDoctor');

    expect(store.has(KEY)).toBe(false);
    expect(getAccessToken()).toBeNull();
    const logout = calls.find((c) => c.path === '/auth/logout');
    expect(logout?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(logout?.auth).toBe('Bearer access-1');
  });
});

describe('renouvellement', () => {
  it('un seul appel au serveur même si plusieurs requêtes expirent en même temps', async () => {
    const calls = fakeServer({
      '/auth/login': loginAs('DOCTOR', 'APPROVED'),
      '/auth/refresh': () => [
        200,
        { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
      ],
    });
    await signIn('dr@ex.org', 'secret');
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual([true, true, true]);
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    expect(getAccessToken()).toBe('access-2');
    expect(JSON.parse(store.get(KEY) ?? '{}').refreshToken).toBe('refresh-2');
  });

  it('une requête refusée (401) renouvelle la session puis est rejouée une fois', async () => {
    let attempts = 0;
    fakeServer({
      '/auth/login': loginAs('DOCTOR', 'APPROVED'),
      '/auth/refresh': () => [
        200,
        { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
      ],
      '/doctor/sessions': (_, headers) => {
        attempts += 1;
        return headers.get('Authorization') === 'Bearer access-2'
          ? [200, { items: [] }]
          : [401, { message: 'expiré' }];
      },
    });
    await signIn('dr@ex.org', 'secret');
    await expect(api('/doctor/sessions')).resolves.toEqual({ items: [] });
    expect(attempts).toBe(2);
  });

  it('jeton refusé par le serveur : retour à la connexion (« session expirée »), tout est effacé', async () => {
    fakeServer({
      '/auth/login': loginAs('DOCTOR', 'APPROVED'),
      '/auth/refresh': () => [401, { message: 'révoqué' }],
    });
    await signIn('dr@ex.org', 'secret');
    await expect(refreshSession()).resolves.toBe(false);

    expect(getSession()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(store.has(KEY)).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('serveur injoignable : la session est gardée', async () => {
    fakeServer({ '/auth/login': loginAs('DOCTOR', 'APPROVED') });
    await signIn('dr@ex.org', 'secret');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(refreshSession()).resolves.toBe(false);
    expect(getSession()).toMatchObject({ status: 'signedIn' });
    expect(store.has(KEY)).toBe(true);
  });
});

describe('démarrage et fin de session', () => {
  it('reprend la session de l’onglet au rechargement de la page', async () => {
    store.set(
      KEY,
      JSON.stringify({
        refreshToken: 'refresh-1',
        lastActive: Date.now(),
        user: { id: 'u1', role: 'DOCTOR', status: 'APPROVED', email: 'dr@ex.org' },
      }),
    );
    fakeServer({
      '/auth/refresh': () => [
        200,
        { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
      ],
    });
    await initSession();
    expect(getSession()).toMatchObject({ status: 'signedIn', user: { status: 'APPROVED' } });
    expect(getAccessToken()).toBe('access-2');
  });

  it('sans session enregistrée : déconnecté, sans appel au serveur', async () => {
    const calls = fakeServer({});
    await initSession();
    expect(getSession()).toEqual({ status: 'signedOut', reason: 'none' });
    expect(calls).toHaveLength(0);
  });

  it('déconnexion : session révoquée côté serveur et tout effacé', async () => {
    const calls = fakeServer({
      '/auth/login': loginAs('DOCTOR', 'APPROVED'),
      '/auth/logout': () => [204, undefined],
    });
    await signIn('dr@ex.org', 'secret');
    await signOut();
    expect(calls.find((c) => c.path === '/auth/logout')?.body).toEqual({
      refreshToken: 'refresh-1',
    });
    expect(getSession()).toEqual({ status: 'signedOut', reason: 'signedOut' });
    expect(store.has(KEY)).toBe(false);
  });

  it('déconnexion automatique après 30 minutes sans activité', async () => {
    fakeServer({
      '/auth/login': loginAs('DOCTOR', 'APPROVED'),
      '/auth/logout': () => [204, undefined],
    });
    await signIn('dr@ex.org', 'secret');
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(getSession()).toEqual({ status: 'signedOut', reason: 'idle' });
  });
});
