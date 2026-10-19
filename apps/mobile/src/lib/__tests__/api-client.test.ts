// Tests du client HTTP : envoi d'un fichier (L4-05), délai propre à la requête, réception d'un fichier (L6-03).
import { api, apiFile, ApiError, setTokenRefresher } from '../api-client';

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

describe('client HTTP : réception d’un fichier (rapport PDF, L6-03)', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const pdfResponse = () =>
    new Response(PDF, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="afyabora-rapport-2026-10-19-30j.pdf"',
      },
    });

  afterEach(() => setTokenRefresher(null));

  it('octets et en-têtes de la réponse ; jeton et Accept PDF envoyés', async () => {
    global.fetch = jest.fn(async (url: string, init: RequestInit & { headers: Headers }) => {
      calls.push({ url, init });
      return pdfResponse();
    }) as unknown as typeof fetch;
    const file = await apiFile('/reports/consultation?period=30');
    expect([...file.bytes]).toEqual([...PDF]);
    expect(file.headers.get('content-disposition')).toContain('afyabora-rapport');
    const { url, init } = calls[0] as Call;
    expect(url.endsWith('/reports/consultation?period=30')).toBe(true);
    expect(init.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    expect(init.headers.get('Accept')).toBe('application/pdf, application/json');
    expect(init.body).toBeUndefined();
  });

  it('refus du serveur ⇒ ApiError avec le statut et le code (corps JSON)', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ code: 'TOO_MANY_REQUESTS', message: 'Trop de rapports' }), {
          status: 429,
        }),
    ) as unknown as typeof fetch;
    const error = (await apiFile('/reports/consultation').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.code).toBe('TOO_MANY_REQUESTS');
    expect(error.message).toBe('Trop de rapports');
  });

  it('jeton expiré (401) ⇒ session renouvelée UNE fois, puis le fichier', async () => {
    let count = 0;
    global.fetch = jest.fn(async () =>
      ++count === 1 ? new Response('{}', { status: 401 }) : pdfResponse(),
    ) as unknown as typeof fetch;
    const refresher = jest.fn(async () => 'refreshed' as const);
    setTokenRefresher(refresher);
    const file = await apiFile('/reports/consultation');
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(file.bytes.length).toBe(PDF.length);
  });

  it('connexion coupée pendant la réception ⇒ « serveur injoignable » (statut 0)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => {
        throw new TypeError('Network request failed');
      },
    })) as unknown as typeof fetch;
    const error = (await apiFile('/reports/consultation').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('le délai couvre aussi la réception du fichier', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      // En-têtes reçus, mais le corps n'arrive jamais : seul le délai arrête la lecture.
      arrayBuffer: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('abandon')));
        }),
    })) as unknown as typeof fetch;
    let settled = false;
    const pending = apiFile('/reports/consultation', { timeoutMs: 60_000 })
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
