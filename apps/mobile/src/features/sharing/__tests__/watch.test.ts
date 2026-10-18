// Tests du ticket L5-08 : suivi en direct d'un partage (watch.ts), avec une horloge et des minuteries simulées.
import type { ShareStatusResponse } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { ApiError } from '@/lib/api-client';
import {
  ACTIVE_POLL_MS,
  WAITING_POLL_MS,
  createShareWatcher,
  formatRemaining,
  remainingSeconds,
  viewOf,
  type WatchState,
} from '../watch';

const T0 = 1_000_000;
const doctor = { firstName: 'Aline', lastName: 'Démo', institution: 'Clinique de démonstration' };
const pending: ShareStatusResponse = {
  status: 'PENDING',
  expiresAt: null,
  claimedAt: null,
  doctor: null,
  remainingSeconds: null,
};
const active = (remaining: number): ShareStatusResponse => ({
  status: 'ACTIVE',
  expiresAt: '2026-10-18T17:30:00.000Z',
  claimedAt: '2026-10-18T17:00:00.000Z',
  doctor,
  remainingSeconds: remaining,
});
const ended = (status: 'EXPIRED' | 'REVOKED'): ShareStatusResponse => ({
  ...active(0),
  status,
  remainingSeconds: null,
});

/** Monde simulé : horloge, minuteries, serveur dont on choisit chaque réponse. */
function world() {
  let now = T0;
  const timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 1;
  const calls: number[] = [];
  const answers: (() => Promise<ShareStatusResponse>)[] = [];
  const states: WatchState[] = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const make = () =>
    createShareWatcher({
      sessionId: 'session-1',
      getStatus: async () => {
        calls.push(now);
        const answer = answers.shift();
        if (!answer) throw new Error('réponse non prévue');
        return answer();
      },
      now: () => now,
      setTimer: (run, ms) => {
        const id = nextId++;
        timers.push({ at: now + ms, run, id });
        return id;
      },
      clearTimer: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      onChange: (s) => states.push(s),
    });
  return {
    make,
    calls,
    states,
    timers,
    flush,
    get now() {
      return now;
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > end) break;
        timers.shift();
        now = due.at;
        due.run();
        await flush();
      }
      now = end;
      await flush();
    },
    answer(result: ShareStatusResponse | Error) {
      answers.push(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      );
    },
    hold() {
      let release: (value: ShareStatusResponse) => void = () => undefined;
      answers.push(() => new Promise<ShareStatusResponse>((resolve) => (release = resolve)));
      return (value: ShareStatusResponse) => release(value);
    },
  };
}

describe('viewOf', () => {
  it('en attente', () => {
    expect(viewOf(pending, T0)).toEqual({ kind: 'waiting' });
  });

  it('accès ouvert : fin estimée = réception + secondes restantes DONNÉES PAR LE SERVEUR', () => {
    expect(viewOf(active(277), T0)).toEqual({
      kind: 'active',
      doctor,
      endsAt: T0 + 277_000,
      expiresAt: '2026-10-18T17:30:00.000Z',
    });
  });

  it('terminé : expiré ou arrêté, le médecin reste connu', () => {
    expect(viewOf(ended('EXPIRED'), T0)).toEqual({ kind: 'ended', reason: 'expired', doctor });
    expect(viewOf(ended('REVOKED'), T0)).toEqual({ kind: 'ended', reason: 'revoked', doctor });
  });

  it('secondes restantes absentes (ne devrait pas arriver) : fin immédiate, donc relecture', () => {
    expect(viewOf({ ...active(0), remainingSeconds: null }, T0)).toMatchObject({ endsAt: T0 });
  });
});

describe('minuteur', () => {
  it.each([
    [277, '04:37'],
    [60, '01:00'],
    [59, '00:59'],
    [0, '00:00'],
    [3600, '1:00:00'],
    [7199, '1:59:59'],
    [-3, '00:00'],
    [12.7, '00:12'],
  ])('%s s ⇒ %s', (seconds, text) => {
    expect(formatRemaining(seconds)).toBe(text);
  });

  it('secondes restantes : arrondies au-dessus, jamais négatives', () => {
    expect(remainingSeconds(T0 + 1500, T0)).toBe(2);
    expect(remainingSeconds(T0 + 1, T0)).toBe(1);
    expect(remainingSeconds(T0, T0)).toBe(0);
    expect(remainingSeconds(T0, T0 + 5000)).toBe(0);
  });
});

describe('createShareWatcher', () => {
  it('lit l’état dès le départ, puis toutes les 3 s tant que le QR attend', async () => {
    const w = world();
    for (let i = 0; i < 4; i++) w.answer(pending);
    w.make();
    await w.flush();
    await w.advance(3 * WAITING_POLL_MS);
    expect(w.calls).toEqual([T0, T0 + 3000, T0 + 6000, T0 + 9000]);
    expect(WAITING_POLL_MS).toBe(3000);
  });

  it('scan détecté à la lecture suivante : « Dr X consulte », puis lecture toutes les 10 s', async () => {
    const w = world();
    w.answer(pending);
    w.answer(active(1800));
    w.answer(active(1790));
    w.answer(active(1780));
    const watcher = w.make();
    await w.flush();
    await w.advance(3000);
    expect(watcher.get().view).toEqual({
      kind: 'active',
      doctor,
      endsAt: T0 + 3000 + 1_800_000,
      expiresAt: '2026-10-18T17:30:00.000Z',
    });
    await w.advance(20_000);
    expect(w.calls).toEqual([T0, T0 + 3000, T0 + 13_000, T0 + 23_000]);
    expect(ACTIVE_POLL_MS).toBe(10_000);
  });

  it('fin du minuteur : relecture PILE à zéro (pas 10 s plus tard) ⇒ « Accès terminé : expiré »', async () => {
    const w = world();
    w.answer(active(4)); // 4 s restantes
    w.answer(ended('EXPIRED'));
    const watcher = w.make();
    await w.flush();
    await w.advance(4000);
    expect(w.calls).toEqual([T0, T0 + 4000]);
    expect(watcher.get().view).toEqual({ kind: 'ended', reason: 'expired', doctor });
  });

  it('accès terminé : plus aucune lecture, même après « relire »', async () => {
    const w = world();
    w.answer(ended('REVOKED'));
    const watcher = w.make();
    await w.flush();
    watcher.refresh();
    await w.advance(600_000);
    expect(w.calls).toHaveLength(1);
    expect(w.timers).toHaveLength(0);
  });

  it('arrêt depuis un autre appareil : vu à la lecture suivante (10 s au plus)', async () => {
    const w = world();
    w.answer(active(1800));
    w.answer(ended('REVOKED'));
    const watcher = w.make();
    await w.flush();
    await w.advance(10_000);
    expect(watcher.get().view).toMatchObject({ kind: 'ended', reason: 'revoked' });
  });

  it('pas de réseau : la dernière vue reste, le problème est signalé, nouvel essai à 2 s puis 4 s', async () => {
    const w = world();
    w.answer(active(1800));
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(active(1770));
    const watcher = w.make();
    await w.flush();
    await w.advance(10_000);
    expect(watcher.get()).toMatchObject({
      view: { kind: 'active' },
      problem: 'offline',
      failures: 1,
    });
    await w.advance(2000);
    expect(watcher.get().failures).toBe(2);
    await w.advance(4000);
    expect(w.calls).toEqual([T0, T0 + 10_000, T0 + 12_000, T0 + 16_000]);
    expect(watcher.get()).toMatchObject({ view: { kind: 'active' }, problem: null, failures: 0 });
  });

  it('autre erreur : « error », et on réessaie aussi', async () => {
    const w = world();
    w.answer(new ApiError(500, 'panne'));
    w.answer(pending);
    const watcher = w.make();
    await w.flush();
    expect(watcher.get()).toMatchObject({ problem: 'error', failures: 1 });
    await w.advance(2000);
    expect(watcher.get()).toMatchObject({ problem: null, view: { kind: 'waiting' } });
  });

  it('404 : la session n’existe plus ⇒ terminé (arrêté), sans réessayer', async () => {
    const w = world();
    w.answer(active(1800));
    w.answer(new ApiError(404, 'introuvable'));
    const watcher = w.make();
    await w.flush();
    await w.advance(10_000);
    expect(watcher.get().view).toEqual({ kind: 'ended', reason: 'revoked', doctor });
    await w.advance(600_000);
    expect(w.calls).toHaveLength(2);
  });

  it('404 avant tout scan : terminé, sans médecin', async () => {
    const w = world();
    w.answer(new ApiError(404, 'introuvable'));
    const watcher = w.make();
    await w.flush();
    expect(watcher.get().view).toEqual({ kind: 'ended', reason: 'revoked', doctor: null });
  });

  it('« relire » (après « Mettre fin à l’accès ») : lecture immédiate', async () => {
    const w = world();
    w.answer(active(1800));
    w.answer(ended('REVOKED'));
    const watcher = w.make();
    await w.flush();
    await w.advance(1000);
    watcher.refresh();
    await w.flush();
    expect(w.calls).toEqual([T0, T0 + 1000]);
    expect(watcher.get().view).toMatchObject({ kind: 'ended', reason: 'revoked' });
  });

  it('« relire » pendant une lecture en route : une seule à la fois, puis une de plus', async () => {
    const w = world();
    const release = w.hold();
    w.answer(active(1800));
    const watcher = w.make();
    await w.flush();
    watcher.refresh();
    watcher.refresh();
    await w.flush();
    expect(w.calls).toHaveLength(1);
    release(pending);
    await w.flush();
    await w.flush();
    expect(w.calls).toHaveLength(2);
    expect(watcher.get().view.kind).toBe('active');
  });

  it('arrière-plan : plus aucune lecture ; retour : lecture immédiate et reprise du rythme', async () => {
    const w = world();
    w.answer(pending);
    w.answer(pending);
    w.answer(pending);
    const watcher = w.make();
    await w.flush();
    watcher.pause();
    expect(w.timers).toHaveLength(0);
    await w.advance(120_000);
    expect(w.calls).toHaveLength(1);
    watcher.refresh();
    await w.flush();
    expect(w.calls).toEqual([T0, T0 + 120_000]);
    await w.advance(3000);
    expect(w.calls).toHaveLength(3);
  });

  it('en pause, une réponse en route ne relance pas de minuterie', async () => {
    const w = world();
    const release = w.hold();
    const watcher = w.make();
    await w.flush();
    watcher.pause();
    release(pending);
    await w.flush();
    expect(w.timers).toHaveLength(0);
  });

  it('relecture demandée puis arrière-plan avant la réponse : aucune requête en arrière-plan', async () => {
    const w = world();
    const release = w.hold();
    const watcher = w.make();
    await w.flush();
    watcher.refresh(); // demandée pendant la lecture en route…
    watcher.pause(); // … puis l'application passe en arrière-plan
    release(pending);
    await w.flush();
    await w.flush();
    expect(w.calls).toHaveLength(1);
  });

  it('écran fermé : plus aucune lecture ; une réponse en route est ignorée', async () => {
    const w = world();
    const release = w.hold();
    const watcher = w.make();
    await w.flush();
    watcher.stop();
    release(active(1800));
    await w.flush();
    expect(watcher.get().view).toEqual({ kind: 'waiting' });
    expect(w.timers).toHaveLength(0);
    watcher.refresh();
    await w.advance(600_000);
    expect(w.calls).toHaveLength(1);
  });

  it('écran fermé pendant l’attente : la minuterie est annulée', async () => {
    const w = world();
    w.answer(pending);
    const watcher = w.make();
    await w.flush();
    expect(w.timers).toHaveLength(1);
    watcher.stop();
    expect(w.timers).toHaveLength(0);
  });
});

describe('textes (fr et en)', () => {
  it('les textes du suivi existent dans les deux langues, avec les mêmes clés', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(en.share.live).sort()).toEqual(keys(fr.share.live).sort());
    for (const key of ['expired', 'expiredNoName', 'revoked', 'revokedNoName']) {
      expect(fr.share.live.ended).toHaveProperty(key);
    }
  });
});
