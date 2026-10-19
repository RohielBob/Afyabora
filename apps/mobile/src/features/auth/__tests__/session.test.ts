// Ticket L1-07 : session mobile. Le serveur est simulé (fetch) et le coffre sécurisé est en mémoire :
// on vérifie chaque scénario sans téléphone ni réseau.
import { api } from '@/lib/api-client';
import {
  __resetSessionForTests,
  getSession,
  initSession,
  refreshSession,
  signIn,
  signOut,
} from '../session';

// ---------- Coffre sécurisé simulé ----------
const mockVault = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  saveTokens: async (access: string, refresh: string) => {
    mockVault.set('access', access);
    mockVault.set('refresh', refresh);
  },
  getAccessToken: async () => mockVault.get('access') ?? null,
  getRefreshToken: async () => mockVault.get('refresh') ?? null,
  clearTokens: async () => {
    mockVault.delete('access');
    mockVault.delete('refresh');
  },
  saveSessionInfo: async (json: string) => mockVault.set('session', json),
  getSessionInfo: async () => mockVault.get('session') ?? null,
  clearSessionInfo: async () => mockVault.delete('session'),
}));

// ---------- Base locale et moteur de synchronisation simulés (L8-06) ----------
// `steps` garde l'ordre des étapes : le moteur doit être arrêté AVANT que la base soit effacée.
const steps: string[] = [];
const mockWipeLocalData = jest.fn(async () => {
  steps.push('wipe');
});
const mockClaimLocalData = jest.fn(async (userId: string) => {
  steps.push(`claim:${userId}`);
});
jest.mock('@/db/reset', () => ({
  wipeLocalData: () => mockWipeLocalData(),
  claimLocalData: (userId: string) => mockClaimLocalData(userId),
  countUnsyncedChanges: async () => 0,
}));
// Rapport PDF rangé sur le téléphone (L6-03) : effacé à la déconnexion.
const mockClearReportFiles = jest.fn();
jest.mock('@/features/report', () => ({ clearReportFiles: () => mockClearReportFiles() }));
let mockSyncNow: () => Promise<unknown> = async () => {
  steps.push('syncNow');
};
jest.mock('@/features/sync', () => ({
  syncNow: () => mockSyncNow(),
  stopSync: async () => {
    steps.push('stopSync');
  },
  requestSync: () => {
    steps.push('requestSync');
  },
}));

// ---------- Serveur simulé ----------
type Handler = (path: string, init: RequestInit) => { status: number; body?: unknown } | 'offline';
let server: Handler;
const calls: string[] = [];
const json = (status: number, body?: unknown) => ({ status, body });

beforeAll(() => {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push(path);
    const result = server(path, init ?? {});
    if (result === 'offline') throw new TypeError('Network request failed');
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => {
        if (result.body === undefined) throw new Error('pas de corps');
        return result.body;
      },
    } as Response;
  }) as typeof fetch;
});

const patient = {
  id: 'u1',
  role: 'PATIENT' as const,
  profileCompleted: true,
  doctorVerificationStatus: null,
};
const login = (role: 'PATIENT' | 'DOCTOR' | 'ADMIN', profileCompleted = true) => ({
  accessToken: 'acces-1',
  refreshToken: 'refresh-1',
  expiresInSeconds: 900,
  user: { id: 'u1', role, profileCompleted, doctorVerificationStatus: null },
});
const authHeader = (init: RequestInit) => new Headers(init.headers).get('Authorization');

beforeEach(() => {
  mockVault.clear();
  calls.length = 0;
  mockWipeLocalData.mockClear();
  mockClaimLocalData.mockClear();
  mockClearReportFiles.mockClear();
  steps.length = 0;
  mockSyncNow = async () => {
    steps.push('syncNow');
  };
  __resetSessionForTests();
  server = () => json(500);
});

describe('connexion (signIn)', () => {
  it('patient : jetons et session enregistrés, direction l’accueil ou l’assistant de profil', async () => {
    expect(await signIn(login('PATIENT', false))).toBe('onboarding');
    expect(mockVault.get('access')).toBe('acces-1');
    expect(mockVault.get('refresh')).toBe('refresh-1');
    expect(getSession()).toEqual({
      status: 'signedIn',
      user: { ...patient, profileCompleted: false },
    });

    expect(await signIn(login('PATIENT', true))).toBe('home');
  });

  it('médecin ou admin : orienté vers le portail, rien n’est gardé sur le téléphone', async () => {
    expect(await signIn(login('DOCTOR'))).toBe('notPatient');
    expect(await signIn(login('ADMIN'))).toBe('notPatient');
    expect(mockVault.size).toBe(0);
    expect(steps).toEqual([]); // ni base locale touchée, ni synchronisation
  });

  it('L8-06 : moteur arrêté, base locale rattachée au compte, PUIS synchronisation demandée', async () => {
    await signIn(login('PATIENT'));
    expect(steps).toEqual(['stopSync', 'claim:u1', 'requestSync']);
  });
});

describe('démarrage de l’app (initSession)', () => {
  it('sans session enregistrée : déconnecté', async () => {
    await initSession();
    expect(getSession()).toEqual({ status: 'signedOut' });
  });

  it('HORS-LIGNE avec une session enregistrée : l’app s’ouvre quand même, connectée (local-first)', async () => {
    await signIn(login('PATIENT'));
    __resetSessionForTests();
    server = () => 'offline';

    await initSession();
    await refreshSession(); // le renouvellement en arrière-plan échoue (réseau)

    expect(getSession()).toEqual({ status: 'signedIn', user: patient });
    expect(mockVault.get('refresh')).toBe('refresh-1'); // la session n'est pas effacée
  });

  it('session refusée par le serveur (révoquée, expirée) : déconnecté avec le motif « expirée »', async () => {
    await signIn(login('PATIENT'));
    __resetSessionForTests();
    server = (path) =>
      path === '/auth/refresh' ? json(401, { code: 'TOKEN_INVALID' }) : json(500);

    await initSession();
    await refreshSession();

    expect(getSession()).toEqual({ status: 'signedOut', reason: 'expired' });
    expect(mockVault.size).toBe(0);
  });

  it('session valide : les jetons sont renouvelés (rotation)', async () => {
    await signIn(login('PATIENT'));
    __resetSessionForTests();
    server = (path) =>
      path === '/auth/refresh'
        ? json(200, { accessToken: 'acces-2', refreshToken: 'refresh-2', expiresInSeconds: 900 })
        : json(500);

    await initSession();
    await refreshSession();

    expect(mockVault.get('access')).toBe('acces-2');
    expect(mockVault.get('refresh')).toBe('refresh-2');
  });

  it('session enregistrée illisible ou d’un autre rôle : ignorée, déconnecté', async () => {
    mockVault.set('refresh', 'refresh-1');
    mockVault.set('session', JSON.stringify({ id: 'u9', role: 'ADMIN' }));
    await initSession();
    expect(getSession()).toEqual({ status: 'signedOut' });
    expect(mockVault.size).toBe(0);
  });
});

describe('renouvellement automatique sur 401', () => {
  it('jeton d’accès expiré : renouvellement puis la requête est rejouée avec le nouveau jeton', async () => {
    await signIn(login('PATIENT'));
    const seen: (string | null)[] = [];
    server = (path, init) => {
      if (path === '/auth/refresh') {
        return json(200, {
          accessToken: 'acces-2',
          refreshToken: 'refresh-2',
          expiresInSeconds: 900,
        });
      }
      seen.push(authHeader(init));
      return authHeader(init) === 'Bearer acces-2' ? json(200, { ok: true }) : json(401);
    };

    await expect(api('/me/profile')).resolves.toEqual({ ok: true });
    expect(seen).toEqual(['Bearer acces-1', 'Bearer acces-2']);
  });

  it('plusieurs requêtes expirées en même temps : UN SEUL renouvellement (sinon le serveur fermerait la session)', async () => {
    await signIn(login('PATIENT'));
    server = (path, init) => {
      if (path === '/auth/refresh') {
        return json(200, {
          accessToken: 'acces-2',
          refreshToken: 'refresh-2',
          expiresInSeconds: 900,
        });
      }
      return authHeader(init) === 'Bearer acces-2' ? json(200, { ok: true }) : json(401);
    };

    await Promise.all([api('/me/profile'), api('/measurements'), api('/insights')]);

    expect(calls.filter((p) => p === '/auth/refresh')).toHaveLength(1);
  });

  it('renouvellement refusé : la session se ferme et l’erreur 401 remonte', async () => {
    await signIn(login('PATIENT'));
    server = (path) => (path === '/auth/refresh' ? json(401) : json(401));

    await expect(api('/me/profile')).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toEqual({ status: 'signedOut', reason: 'expired' });
  });

  it('les routes publiques ne déclenchent jamais de renouvellement', async () => {
    await signIn(login('PATIENT'));
    server = () => json(401, { message: 'Email ou mot de passe incorrect.' });

    await expect(
      api('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(calls).not.toContain('/auth/refresh');
  });
});

describe('déconnexion (signOut)', () => {
  it('révoque la session sur le serveur, vide la base locale et le coffre', async () => {
    await signIn(login('PATIENT'));
    let logoutBody: unknown;
    server = (path, init) => {
      if (path === '/auth/logout') {
        logoutBody = JSON.parse(String(init.body));
        return json(204);
      }
      return json(500);
    };

    await signOut();

    expect(logoutBody).toEqual({ refreshToken: 'refresh-1' });
    expect(mockWipeLocalData).toHaveBeenCalledTimes(1);
    expect(mockClearReportFiles).toHaveBeenCalledTimes(1); // L6-03 : plus de rapport PDF sur le téléphone
    // Dernier envoi tant que la session est valide, moteur arrêté, et SEULEMENT ENSUITE base effacée.
    expect(steps.slice(-3)).toEqual(['syncNow', 'stopSync', 'wipe']);
    expect(calls.indexOf('/auth/logout')).toBeGreaterThanOrEqual(0);
    expect(mockVault.size).toBe(0);
    expect(getSession()).toEqual({ status: 'signedOut', reason: 'signedOut' });
  });

  it('hors-ligne : la déconnexion se fait quand même sur le téléphone', async () => {
    await signIn(login('PATIENT'));
    server = () => 'offline';

    await signOut();

    expect(mockWipeLocalData).toHaveBeenCalledTimes(1);
    expect(mockClearReportFiles).toHaveBeenCalledTimes(1);
    expect(mockVault.size).toBe(0);
    expect(getSession().status).toBe('signedOut');
  });

  it('dernier envoi trop long : on se déconnecte quand même au bout de 5 s', async () => {
    await signIn(login('PATIENT'));
    server = () => json(204);
    mockSyncNow = () => new Promise(() => undefined); // ne répond jamais
    jest.useFakeTimers();
    try {
      const done = signOut();
      await jest.advanceTimersByTimeAsync(5_000);
      await done;
    } finally {
      jest.useRealTimers();
    }
    expect(steps.slice(-2)).toEqual(['stopSync', 'wipe']);
    expect(getSession().status).toBe('signedOut');
  });
});
