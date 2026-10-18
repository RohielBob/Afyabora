// Tests du ticket L5-07 : rotation du QR (rotation.ts), avec une horloge et des minuteries simulées.
import type { ShareTokenDto } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { ApiError } from '@/lib/api-client';
import {
  ROTATE_BEFORE_END_MS,
  ROTATION_PERIOD_MS,
  TOKEN_LIFE_MS,
  createQrRotator,
  isTokenAlive,
  renewOutcome,
  retryDelayMs,
  rotationProgress,
  secondsToNext,
  type RotationState,
} from '../rotation';

const T0 = 1_000_000;
const token = (n: number): ShareTokenDto => ({
  token: `jeton-${n}`.padEnd(43, 'x'),
  expiresAt: '2026-10-18T08:01:00.000Z',
});

/** Monde simulé : horloge, minuteries, serveur dont on choisit chaque réponse. */
function world() {
  let now = T0;
  const timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 1;
  const calls: string[] = [];
  const answers: (() => Promise<ShareTokenDto>)[] = [];
  const states: RotationState[] = [];
  const rotator = createQrRotator({
    sessionId: 'session-1',
    first: token(1),
    rotate: async (id) => {
      calls.push(id);
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
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    rotator,
    calls,
    states,
    timers,
    get now() {
      return now;
    },
    /** Avance l'horloge ; déclenche les minuteries échues, puis laisse les réponses arriver. */
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
    /** Prochaine réponse du serveur : un jeton, ou une erreur. */
    answer(result: ShareTokenDto | Error) {
      answers.push(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      );
    },
    /** Prochaine réponse qui n'arrive que quand on appelle `release`. */
    hold() {
      let release: (value: ShareTokenDto) => void = () => undefined;
      answers.push(() => new Promise<ShareTokenDto>((resolve) => (release = resolve)));
      return (value: ShareTokenDto) => release(value);
    },
    flush,
  };
}

describe('règles de temps', () => {
  it('jeton de 60 s, renouvelé 10 s avant la fin : un nouveau QR toutes les 50 s', () => {
    expect(TOKEN_LIFE_MS).toBe(60_000);
    expect(ROTATE_BEFORE_END_MS).toBe(10_000);
    expect(ROTATION_PERIOD_MS).toBe(50_000);
  });

  it('secondes avant le prochain QR : arrondies au-dessus, jamais négatives', () => {
    const s = { rotateAt: T0 + 50_000 };
    expect(secondsToNext(s, T0)).toBe(50);
    expect(secondsToNext(s, T0 + 49_001)).toBe(1);
    expect(secondsToNext(s, T0 + 50_000)).toBe(0);
    expect(secondsToNext(s, T0 + 90_000)).toBe(0);
  });

  it('progression de 0 à 1, bornée', () => {
    const s = { receivedAt: T0, rotateAt: T0 + 50_000 };
    expect(rotationProgress(s, T0)).toBe(0);
    expect(rotationProgress(s, T0 + 25_000)).toBe(0.5);
    expect(rotationProgress(s, T0 + 80_000)).toBe(1);
    expect(rotationProgress(s, T0 - 5000)).toBe(0);
    expect(rotationProgress({ receivedAt: T0, rotateAt: T0 }, T0)).toBe(1);
  });

  it('QR valable 60 s après sa RÉCEPTION (jamais comparé à l’heure du serveur)', () => {
    const s = { receivedAt: T0 };
    expect(isTokenAlive(s, T0 + 59_999)).toBe(true);
    expect(isTokenAlive(s, T0 + 60_000)).toBe(false);
  });

  it('nouvel essai : 2 s, 4 s, 8 s, puis 15 s au plus', () => {
    expect([1, 2, 3, 4, 5, 10].map(retryDelayMs)).toEqual([
      2000, 4000, 8000, 15_000, 15_000, 15_000,
    ]);
  });
});

describe('renewOutcome', () => {
  it.each([
    ['409 : QR scanné (ou partage terminé)', new ApiError(409, 'x'), 'scanned'],
    ['404 : partage disparu', new ApiError(404, 'x'), 'ended'],
    ['pas de réseau', new ApiError(0, 'x'), 'offline'],
    ['429', new ApiError(429, 'x'), 'busy'],
    ['503', new ApiError(503, 'x'), 'busy'],
    ['500', new ApiError(500, 'x'), 'error'],
    ['réponse hors contrat', new Error('x'), 'error'],
  ])('%s ⇒ %s', (_label, error, outcome) => {
    expect(renewOutcome(error)).toBe(outcome);
  });
});

describe('createQrRotator', () => {
  it('affiche le premier QR, puis en demande un nouveau à 50 s (pas avant)', async () => {
    const w = world();
    expect(w.rotator.get()).toMatchObject({
      phase: 'showing',
      token: token(1).token,
      generation: 1,
    });
    w.answer(token(2));
    await w.advance(49_999);
    expect(w.calls).toEqual([]);
    await w.advance(1);
    expect(w.calls).toEqual(['session-1']);
    expect(w.rotator.get()).toMatchObject({
      phase: 'showing',
      token: token(2).token,
      generation: 2,
      receivedAt: T0 + 50_000,
      rotateAt: T0 + 100_000,
    });
  });

  it('pendant la demande : phase « renouvellement », l’ancien QR reste affiché', async () => {
    const w = world();
    const release = w.hold();
    await w.advance(50_000);
    expect(w.rotator.get()).toMatchObject({ phase: 'renewing', token: token(1).token });
    release(token(2));
    await w.flush();
    expect(w.rotator.get()).toMatchObject({ phase: 'showing', token: token(2).token });
  });

  it('5 minutes : un nouveau QR toutes les 50 s, chaque fois différent', async () => {
    const w = world();
    for (let n = 2; n <= 7; n++) w.answer(token(n));
    await w.advance(300_000);
    expect(w.calls).toHaveLength(6);
    expect(w.rotator.get()).toMatchObject({ generation: 7, token: token(7).token });
  });

  it('QR scanné (409) : plus aucune demande, phase « scanné »', async () => {
    const w = world();
    w.answer(new ApiError(409, 'SESSION_NOT_PENDING'));
    await w.advance(50_000);
    expect(w.rotator.get().phase).toBe('scanned');
    await w.advance(600_000);
    w.rotator.retryNow(); // « Réessayer » ou retour dans l'app : rien ne repart
    w.rotator.resume();
    await w.flush();
    expect(w.calls).toHaveLength(1);
    expect(w.timers).toHaveLength(0);
  });

  it('partage disparu (404) : arrêt, phase « terminé »', async () => {
    const w = world();
    w.answer(new ApiError(404, 'introuvable'));
    await w.advance(50_000);
    expect(w.rotator.get().phase).toBe('ended');
    await w.advance(600_000);
    expect(w.calls).toHaveLength(1);
  });

  it('pas de réseau : nouvel essai à 2 s, 4 s, 8 s… et la raison est connue ; retour du réseau ⇒ QR neuf', async () => {
    const w = world();
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(token(2));
    await w.advance(50_000);
    expect(w.rotator.get()).toMatchObject({ phase: 'retrying', problem: 'offline', failures: 1 });
    await w.advance(1999);
    expect(w.calls).toHaveLength(1);
    await w.advance(1);
    expect(w.calls).toHaveLength(2); // + 2 s
    await w.advance(4000);
    expect(w.calls).toHaveLength(3); // + 4 s
    expect(w.rotator.get().failures).toBe(3);
    await w.advance(8000);
    expect(w.calls).toHaveLength(4); // + 8 s
    expect(w.rotator.get()).toMatchObject({
      phase: 'showing',
      problem: null,
      failures: 0,
      token: token(2).token,
    });
  });

  it('pendant les essais ratés, le QR affiché est masqué dès qu’il n’est plus valable', async () => {
    const w = world();
    for (let i = 0; i < 5; i++) w.answer(new ApiError(503, 'occupé'));
    await w.advance(50_000);
    expect(isTokenAlive(w.rotator.get(), w.now)).toBe(true); // reçu à T0, encore 10 s
    await w.advance(10_000);
    expect(w.rotator.get().phase).toBe('retrying');
    expect(isTokenAlive(w.rotator.get(), w.now)).toBe(false);
  });

  it('« Réessayer » : demande tout de suite, sans attendre l’essai programmé', async () => {
    const w = world();
    w.answer(new ApiError(0, 'injoignable'));
    w.answer(token(2));
    await w.advance(50_000);
    w.rotator.retryNow();
    await w.flush();
    expect(w.calls).toHaveLength(2);
    expect(w.rotator.get().phase).toBe('showing');
  });

  it('jamais deux demandes en même temps (double appui sur « Réessayer »)', async () => {
    const w = world();
    const release = w.hold();
    w.rotator.retryNow();
    w.rotator.retryNow();
    w.rotator.resume();
    await w.flush();
    expect(w.calls).toHaveLength(1);
    release(token(2));
    await w.flush();
    expect(w.rotator.get().token).toBe(token(2).token);
  });

  it('retour dans l’application après l’heure prévue : nouveau QR tout de suite', async () => {
    const w = world();
    w.answer(token(2));
    // En arrière-plan, la minuterie a été suspendue : l'horloge avance sans elle.
    w.timers.splice(0);
    await w.advance(60_000); // 10 s après l'heure prévue
    expect(w.calls).toHaveLength(0);
    w.rotator.resume();
    await w.flush();
    expect(w.calls).toHaveLength(1);
    expect(w.rotator.get().token).toBe(token(2).token);
  });

  it('retour avant l’heure : pas de demande, la minuterie est reprogrammée', async () => {
    const w = world();
    w.timers.splice(0);
    await w.advance(20_000);
    w.rotator.resume();
    expect(w.calls).toHaveLength(0);
    w.answer(token(2));
    await w.advance(30_000);
    expect(w.calls).toHaveLength(1);
  });

  it('écran fermé : plus aucune demande ; une réponse en route est ignorée', async () => {
    const w = world();
    const release = w.hold();
    await w.advance(50_000);
    w.rotator.stop();
    expect(w.rotator.get().phase).toBe('stopped');
    expect(w.timers).toHaveLength(0); // aucune minuterie oubliée
    release(token(2));
    await w.flush();
    expect(w.rotator.get()).toMatchObject({ phase: 'stopped', token: token(1).token });
    await w.advance(600_000);
    expect(w.calls).toHaveLength(1);
    w.rotator.retryNow();
    w.rotator.resume();
    await w.flush();
    expect(w.calls).toHaveLength(1);
  });

  it('écran fermé pendant qu’un QR est affiché : la minuterie est annulée, plus rien ne part', async () => {
    const w = world();
    expect(w.timers).toHaveLength(1);
    w.rotator.stop();
    expect(w.timers).toHaveLength(0);
    await w.advance(600_000);
    expect(w.calls).toHaveLength(0);
  });

  it('chaque changement est signalé à l’écran', async () => {
    const w = world();
    w.answer(token(2));
    await w.advance(50_000);
    expect(w.states.map((s) => s.phase)).toEqual(['renewing', 'showing']);
  });
});

describe('textes (fr et en)', () => {
  it('les textes du QR existent dans les deux langues, avec les mêmes clés', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(en.share.qr).sort()).toEqual(keys(fr.share.qr).sort());
    for (const problem of ['offline', 'busy', 'error']) {
      expect(fr.share.qr.problem).toHaveProperty(problem);
    }
  });
});
