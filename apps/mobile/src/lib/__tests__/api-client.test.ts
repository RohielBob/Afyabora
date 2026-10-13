// Tests du client HTTP pour l'envoi d'un fichier (L4-05) : multipart et délai propre à la requête.
import { api, ApiError } from '../api-client';

jest.mock('../secure-storage', () => ({ getAccessToken: async () => 'jeton-de-test' }));

type Call = { url: string; init: RequestInit & { headers: Headers } };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit & { headers: Headers }) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('client HTTP : corps de requête', () => {
  it('objet ⇒ JSON avec Content-Type', async () => {
    await api('/x', { method: 'POST', body: { a: 1 } });
    const { init } = calls[0] as Call;
    expect(init.body).toBe('{"a":1}');
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get('Authorization')).toBe('Bearer jeton-de-test');
  });

  it('FormData ⇒ envoyé tel quel, SANS Content-Type (la frontière est ajoutée par fetch)', async () => {
    const form = new FormData();
    form.append('defaultUnit', 'G_L');
    await api('/imports/preview', { method: 'POST', body: form });
    const { init } = calls[0] as Call;
    expect(init.body).toBe(form);
    expect(init.headers.get('Content-Type')).toBeNull();
    expect(init.headers.get('Accept')).toBe('application/json');
  });

  it('sans corps ⇒ ni corps ni Content-Type', async () => {
    await api('/x');
    const { init } = calls[0] as Call;
    expect(init.body).toBeUndefined();
    expect(init.headers.get('Content-Type')).toBeNull();
  });
});

describe('client HTTP : délai', () => {
  /** Serveur qui ne répond jamais : seul le délai arrête la requête. */
  const hang = () => {
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('abandon')));
        }),
    ) as unknown as typeof fetch;
  };

  it('15 s par défaut, puis « serveur injoignable » (statut 0)', async () => {
    jest.useFakeTimers();
    hang();
    const pending = api('/x').catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(14_999);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    const error = (await pending) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('délai propre à la requête (envoi d’un fichier : 60 s)', async () => {
    jest.useFakeTimers();
    hang();
    let settled = false;
    const pending = api('/imports/preview', { method: 'POST', timeoutMs: 60_000 })
      .catch((e: unknown) => e)
      .finally(() => {
        settled = true;
      });
    await jest.advanceTimersByTimeAsync(59_000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(((await pending) as ApiError).status).toBe(0);
  });
});
