// Ticket L5-03 : blocage après 5 scans ratés en une minute (claim-limiter.ts), sans base : tourne partout.
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  CLAIM_BLOCKED_MESSAGE,
  CLAIM_FAILURE_WINDOW_MS,
  CLAIM_MAX_FAILURES,
  ClaimFailureLimiter,
} from '../src/modules/sharing/claim-limiter';

const T0 = new Date('2026-10-18T08:00:00.000Z').getTime();
const at = (ms: number) => new Date(T0 + ms);
const KEYS = ['doctor:d1', 'ip:10.0.0.1'];

/** `n` scans ratés (jamais pardonnés), à `step` ms d'écart à partir de `from`. */
function fail(limiter: ClaimFailureLimiter, n: number, from = 0, step = 1000, keys = KEYS) {
  for (let i = 0; i < n; i++) limiter.begin(keys, at(from + i * step));
}

/** L'erreur levée par `begin`, ou `null`. */
function blocked(limiter: ClaimFailureLimiter, when: number, keys = KEYS) {
  try {
    limiter.begin(keys, at(when));
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
}

describe('ClaimFailureLimiter', () => {
  it('5 échecs par minute au plus', () => {
    expect(CLAIM_MAX_FAILURES).toBe(5);
    expect(CLAIM_FAILURE_WINDOW_MS).toBe(60_000);
  });

  it('5 scans ratés passent ; le 6e est bloqué : 429, message clair et délai d’attente', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5); // à 0, 1, 2, 3 et 4 s
    const error = blocked(limiter, 5_000);
    expect(error?.getStatus()).toBe(429);
    // Le 1er échec (à 0 s) sort de la fenêtre à 60 s : il reste 55 s à attendre.
    expect(error?.getResponse()).toEqual({
      message: CLAIM_BLOCKED_MESSAGE,
      statusCode: 429,
      retryAfterSeconds: 55,
    });
  });

  it('4 scans ratés : le 5e passe encore', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 4);
    expect(blocked(limiter, 4_000)).toBeNull();
  });

  it('les scans RÉUSSIS ne comptent pas : 20 réussites de suite, jamais bloqué', () => {
    const limiter = new ClaimFailureLimiter();
    for (let i = 0; i < 20; i++) limiter.begin(KEYS, at(i * 100))();
    expect(blocked(limiter, 2_000)).toBeNull();
  });

  it('pardonner un essai n’en retire qu’UN (les échecs du même instant restent)', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 4, 0, 0); // 4 échecs au même instant
    limiter.begin(KEYS, at(0))(); // un 5e essai, réussi
    expect(blocked(limiter, 0)).toBeNull(); // 4 échecs : le 5e essai passe…
    expect(blocked(limiter, 0)?.getStatus()).toBe(429); // … et compte : 6e bloqué
  });

  it('essais simultanés : comptés dès leur début, le 6e est bloqué avant qu’aucun ne finisse', () => {
    const limiter = new ClaimFailureLimiter();
    const pending = Array.from({ length: 5 }, () => limiter.begin(KEYS, at(0)));
    expect(blocked(limiter, 0)?.getStatus()).toBe(429);
    pending.forEach((succeeded) => succeeded());
    expect(blocked(limiter, 0)).toBeNull();
  });

  it('fenêtre glissante : débloqué dès que le plus ancien échec a 60 s', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5); // 0 … 4 s
    expect(blocked(limiter, 59_999)?.getStatus()).toBe(429);
    expect(blocked(limiter, 60_000)).toBeNull();
  });

  it('un essai bloqué ne prolonge PAS le blocage', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5);
    for (let s = 10; s < 60; s += 10) expect(blocked(limiter, s * 1000)?.getStatus()).toBe(429);
    expect(blocked(limiter, 60_000)).toBeNull();
  });

  it('le délai d’attente est arrondi à la seconde supérieure, jamais 0', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 0);
    const error = blocked(limiter, 59_999);
    expect((error?.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(1);
  });

  it('délai arrondi au-dessus : 55,5 s ⇒ 56 s', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 0);
    const error = blocked(limiter, 4_500);
    expect((error?.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(56);
  });

  it('une seule clé (adresse IP inconnue) : bloqué aussi', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 1000, ['doctor:d1']);
    expect(blocked(limiter, 5_000, ['doctor:d1'])?.getStatus()).toBe(429);
  });

  it('les deux clés bloquées : on attend la PLUS LONGUE des deux', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 1000, ['doctor:d2', 'ip:10.0.0.2']); // adresse B : libre à 60 s
    fail(limiter, 5, 30_000, 1000, ['doctor:d1', 'ip:10.0.0.1']); // compte d1 : libre à 90 s
    const error = blocked(limiter, 35_000, ['doctor:d1', 'ip:10.0.0.2']);
    expect((error?.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(55);
  });

  it('bloqué si l’UNE des clés a atteint la limite : même compte depuis une autre adresse', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 1000, ['doctor:d1', 'ip:10.0.0.1']);
    expect(blocked(limiter, 5_000, ['doctor:d1', 'ip:10.0.0.2'])?.getStatus()).toBe(429);
  });

  it('… et même adresse avec un autre compte', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 1000, ['doctor:d1', 'ip:10.0.0.1']);
    expect(blocked(limiter, 5_000, ['doctor:d2', 'ip:10.0.0.1'])?.getStatus()).toBe(429);
  });

  it('un autre compte depuis une autre adresse n’est pas touché', () => {
    const limiter = new ClaimFailureLimiter();
    fail(limiter, 5, 0, 1000, ['doctor:d1', 'ip:10.0.0.1']);
    expect(blocked(limiter, 5_000, ['doctor:d2', 'ip:10.0.0.2'])).toBeNull();
  });

  it('beaucoup d’adresses différentes : les compteurs anciens sont purgés (mémoire bornée)', () => {
    const limiter = new ClaimFailureLimiter();
    for (let i = 0; i < 10_050; i++) limiter.begin([`ip:${i}`], at(0));
    limiter.begin(['ip:nouvelle'], at(61_000));
    const size = (limiter as unknown as { failures: Map<string, number[]> }).failures.size;
    expect(size).toBe(1);
  });
});
