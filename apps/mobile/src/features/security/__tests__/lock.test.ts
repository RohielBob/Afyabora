// Ticket L1-09 : règles du verrouillage (code, empreinte, attente, retour dans l'app).
import { createHash } from 'node:crypto';
import {
  checkPin,
  hashPin,
  parseAttempts,
  parsePinRecord,
  parseSettings,
  pinProblem,
  registerFailure,
  secondsBlocked,
  shouldRelock,
  NO_ATTEMPTS,
  type LockSettings,
} from '../lock-rules';

// SHA-256 de Node à la place d'expo-crypto (même résultat, sans téléphone).
const sha256 = async (text: string) => createHash('sha256').update(text).digest('hex');

describe('choix du code', () => {
  it('accepte un code de 4 à 6 chiffres non évident', () => {
    expect(pinProblem('2580')).toBeNull();
    expect(pinProblem('193746')).toBeNull();
  });

  it('refuse un code trop court, trop long ou avec autre chose que des chiffres', () => {
    expect(pinProblem('123')).toBe('length');
    expect(pinProblem('1234567')).toBe('length');
    expect(pinProblem('12a4')).toBe('digits');
  });

  it('refuse les codes trop faciles à deviner', () => {
    for (const pin of ['0000', '1111', '1234', '123456', '4321', '987654']) {
      expect(pinProblem(pin)).toBe('tooSimple');
    }
  });
});

describe('empreinte du code', () => {
  it('ne contient jamais le code et dépend du sel', async () => {
    const a = await hashPin('2580', 'sel-a', sha256);
    const b = await hashPin('2580', 'sel-b', sha256);
    expect(a).not.toContain('2580');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it('reconnaît le bon code et refuse les autres', async () => {
    const record = { salt: 'sel', hash: await hashPin('2580', 'sel', sha256) };
    expect(await checkPin('2580', record, sha256)).toBe(true);
    expect(await checkPin('2581', record, sha256)).toBe(false);
    expect(await checkPin('', record, sha256)).toBe(false);
  });
});

describe('erreurs et attente', () => {
  it('4 erreurs : pas d’attente ; 5e : 30 s ; puis l’attente double, jusqu’à 5 min', () => {
    const now = 1_000_000;
    let state = NO_ATTEMPTS;
    for (let i = 0; i < 4; i++) state = registerFailure(state, now);
    expect(secondsBlocked(state, now)).toBe(0);

    state = registerFailure(state, now);
    expect(secondsBlocked(state, now)).toBe(30);
    state = registerFailure(state, now);
    expect(secondsBlocked(state, now)).toBe(60);
    for (let i = 0; i < 10; i++) state = registerFailure(state, now);
    expect(secondsBlocked(state, now)).toBe(300);
    expect(secondsBlocked(state, now + 300_000)).toBe(0);
  });
});

describe('retour dans l’app', () => {
  const settings = (timeout: LockSettings['timeout'], enabled = true): LockSettings => ({
    enabled,
    biometrics: false,
    timeout,
    pinLength: 4,
  });

  it('se reverrouille selon le délai choisi', () => {
    expect(shouldRelock(settings('immediate'), 500)).toBe(true);
    expect(shouldRelock(settings('1min'), 30_000)).toBe(false);
    expect(shouldRelock(settings('1min'), 60_000)).toBe(true);
    expect(shouldRelock(settings('5min'), 120_000)).toBe(false);
  });

  it('ne verrouille jamais si le verrouillage est désactivé', () => {
    expect(shouldRelock(settings('immediate', false), 999_999)).toBe(false);
  });
});

describe('lecture des réglages enregistrés (valeurs abîmées ignorées)', () => {
  it('réglages', () => {
    expect(parseSettings(null)).toEqual({
      enabled: false,
      biometrics: false,
      timeout: 'immediate',
      pinLength: 4,
    });
    expect(
      parseSettings('{"enabled":true,"biometrics":true,"timeout":"5min","pinLength":6}'),
    ).toEqual({ enabled: true, biometrics: true, timeout: '5min', pinLength: 6 });
    expect(parseSettings('{"enabled":"oui","timeout":"1h","pinLength":12}')).toEqual({
      enabled: false,
      biometrics: false,
      timeout: 'immediate',
      pinLength: 4,
    });
    expect(parseSettings('pas du json').enabled).toBe(false);
  });

  it('erreurs et empreinte', () => {
    expect(parseAttempts('{"failures":3,"blockedUntil":42}')).toEqual({
      failures: 3,
      blockedUntil: 42,
    });
    expect(parseAttempts('n’importe quoi')).toEqual(NO_ATTEMPTS);
    expect(parsePinRecord('{"salt":"s","hash":"h"}')).toEqual({ salt: 's', hash: 'h' });
    expect(parsePinRecord('{"salt":1}')).toBeNull();
  });
});
