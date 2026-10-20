// Réveil du serveur hébergé (src/lib/server-wake.ts) : une seule requête à la fois, réponse ou échec
// silencieux, et un délai long (le serveur met jusqu'à une minute à démarrer).
import { WAKE_TIMEOUT_MS, wakeServer } from '../server-wake';

describe('wakeServer', () => {
  afterEach(() => jest.useRealTimers());

  it('appelle /health, sans jeton, et répond vrai si le serveur répond', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true });
    await expect(wakeServer(fetcher as unknown as typeof fetch)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health$/);
    expect(init.headers).toBeUndefined();
  });

  it('plusieurs appels en même temps : UNE seule requête', async () => {
    let answer: (value: { ok: boolean }) => void = () => undefined;
    const fetcher = jest.fn(() => new Promise<{ ok: boolean }>((resolve) => (answer = resolve)));
    const a = wakeServer(fetcher as unknown as typeof fetch);
    const b = wakeServer(fetcher as unknown as typeof fetch);
    answer({ ok: true });
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Une fois terminée, un nouvel appel refait une requête.
    await wakeServer(jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch);
  });

  it('serveur injoignable ou en erreur : faux, sans exception', async () => {
    await expect(
      wakeServer(jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never),
    ).resolves.toBe(false);
    await expect(wakeServer(jest.fn().mockResolvedValue({ ok: false }) as never)).resolves.toBe(
      false,
    );
  });

  it('délai long : la requête n’est abandonnée qu’après WAKE_TIMEOUT_MS (≥ 60 s)', async () => {
    jest.useFakeTimers();
    expect(WAKE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    let signal: AbortSignal | undefined;
    const fetcher = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const result = wakeServer(fetcher as unknown as typeof fetch);
    jest.advanceTimersByTime(WAKE_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal?.aborted).toBe(true);
    await expect(result).resolves.toBe(false);
  });
});
