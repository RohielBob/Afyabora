// Verrouillage de l'app (L1-09) : règles SANS interface (testées dans __tests__/lock.test.ts).
//  - le code fait 4 à 6 chiffres et ne doit pas être trop simple à deviner ;
//  - seule une EMPREINTE du code est gardée (SHA-256 avec un « sel » aléatoire propre au téléphone) :
//    même en lisant le coffre sécurisé, on ne retrouve pas le code ;
//  - après 5 erreurs, il faut attendre ; l'attente double à chaque nouvelle erreur (30 s → 5 min max) ;
//  - en revenant dans l'app, elle se reverrouille si elle est restée en arrière-plan plus que le délai choisi.

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const FREE_ATTEMPTS = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 5 * 60_000;

export type LockTimeout = 'immediate' | '1min' | '5min';
export const LOCK_TIMEOUTS: readonly LockTimeout[] = ['immediate', '1min', '5min'];
const TIMEOUT_MS: Record<LockTimeout, number> = { immediate: 0, '1min': 60_000, '5min': 300_000 };

export interface LockSettings {
  enabled: boolean;
  /** Déverrouiller aussi avec l'empreinte / le visage (le code reste le secours). */
  biometrics: boolean;
  timeout: LockTimeout;
  /** Longueur du code choisi (4 à 6) : l'écran verrouillé affiche autant de points. */
  pinLength: number;
}
export const DEFAULT_LOCK_SETTINGS: LockSettings = {
  enabled: false,
  biometrics: false,
  timeout: 'immediate',
  pinLength: PIN_MIN_LENGTH,
};

/** Empreinte enregistrée du code. */
export interface PinRecord {
  salt: string;
  hash: string;
}

/** Erreurs successives et date jusqu'à laquelle il faut attendre. */
export interface AttemptState {
  failures: number;
  blockedUntil: number; // horodatage en ms ; 0 = pas de blocage
}
export const NO_ATTEMPTS: AttemptState = { failures: 0, blockedUntil: 0 };

// ---------- Choix du code ----------

export type PinProblem = 'length' | 'digits' | 'tooSimple';

/** null si le code est acceptable, sinon la raison du refus. */
export function pinProblem(pin: string): PinProblem | null {
  if (!/^\d*$/.test(pin)) return 'digits';
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) return 'length';
  const digits = [...pin].map(Number);
  const allSame = digits.every((d) => d === digits[0]);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1]! - 1);
  return allSame || ascending || descending ? 'tooSimple' : null;
}

// ---------- Empreinte du code ----------

/** Fonction de hachage (SHA-256 en hexadécimal), fournie par expo-crypto sur le téléphone. */
export type Sha256 = (text: string) => Promise<string>;

export async function hashPin(pin: string, salt: string, sha256: Sha256): Promise<string> {
  // Le sel rend l'empreinte propre à ce téléphone : une table d'empreintes toutes faites ne sert à rien.
  return sha256(`afyabora-pin:${salt}:${pin}`);
}

export async function checkPin(pin: string, record: PinRecord, sha256: Sha256): Promise<boolean> {
  const hash = await hashPin(pin, record.salt, sha256);
  // Comparaison sur toute la longueur (pas d'arrêt au premier caractère différent).
  if (hash.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

// ---------- Erreurs et attente ----------

/** Nouvel état après une erreur de code. */
export function registerFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  if (failures < FREE_ATTEMPTS) return { failures, blockedUntil: 0 };
  const wait = Math.min(FIRST_WAIT_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_WAIT_MS);
  return { failures, blockedUntil: now + wait };
}

/** Secondes restantes avant de pouvoir réessayer (0 = on peut). */
export function secondsBlocked(state: AttemptState, now: number): number {
  return Math.max(0, Math.ceil((state.blockedUntil - now) / 1000));
}

// ---------- Retour dans l'app ----------

/** Faut-il reverrouiller en revenant dans l'app après `elapsedMs` en arrière-plan ? */
export function shouldRelock(settings: LockSettings, elapsedMs: number): boolean {
  return settings.enabled && elapsedMs >= TIMEOUT_MS[settings.timeout];
}

// ---------- Lecture des réglages enregistrés ----------

export function parseSettings(raw: string | null): LockSettings {
  if (!raw) return DEFAULT_LOCK_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<LockSettings> | null;
    return {
      enabled: value?.enabled === true,
      biometrics: value?.biometrics === true,
      timeout: LOCK_TIMEOUTS.includes(value?.timeout as LockTimeout)
        ? (value?.timeout as LockTimeout)
        : DEFAULT_LOCK_SETTINGS.timeout,
      pinLength:
        Number.isInteger(value?.pinLength) &&
        value!.pinLength! >= PIN_MIN_LENGTH &&
        value!.pinLength! <= PIN_MAX_LENGTH
          ? value!.pinLength!
          : DEFAULT_LOCK_SETTINGS.pinLength,
    };
  } catch {
    return DEFAULT_LOCK_SETTINGS;
  }
}

export function parseAttempts(raw: string | null): AttemptState {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<AttemptState>) : null;
    return {
      failures: Number.isInteger(value?.failures) ? Math.max(0, value!.failures!) : 0,
      blockedUntil: typeof value?.blockedUntil === 'number' ? value.blockedUntil : 0,
    };
  } catch {
    return NO_ATTEMPTS;
  }
}

export function parsePinRecord(raw: string | null): PinRecord | null {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<PinRecord>) : null;
    return typeof value?.salt === 'string' && typeof value.hash === 'string'
      ? { salt: value.salt, hash: value.hash }
      : null;
  } catch {
    return null;
  }
}
