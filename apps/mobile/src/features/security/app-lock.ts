// État du verrouillage partagé par toute l'app (L1-09) : réglages, verrouillé ou non, erreurs de code.
// Même principe que la session (L1-07) : un petit magasin observable, lu par les écrans avec useAppLock().
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  DEFAULT_LOCK_SETTINGS,
  NO_ATTEMPTS,
  checkPin,
  hashPin,
  parseAttempts,
  parsePinRecord,
  parseSettings,
  registerFailure,
  shouldRelock,
  type AttemptState,
  type LockSettings,
  type Sha256,
} from './lock-rules';
import { clearLock, readLock, writeLock } from './lock-storage';

export interface AppLockState {
  ready: boolean;
  settings: LockSettings;
  locked: boolean;
  attempts: AttemptState;
}

let state: AppLockState = {
  ready: false,
  settings: DEFAULT_LOCK_SETTINGS,
  locked: false,
  attempts: NO_ATTEMPTS,
};
const listeners = new Set<() => void>();
function setState(patch: Partial<AppLockState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useAppLock(): AppLockState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const sha256: Sha256 = (text) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

/** Au démarrage : lit les réglages ; si le verrouillage est actif, l'app démarre verrouillée. */
export async function initAppLock(): Promise<void> {
  const [settings, attempts] = await Promise.all([readLock('settings'), readLock('attempts')]);
  const parsed = parseSettings(settings);
  setState({
    ready: true,
    settings: parsed,
    attempts: parseAttempts(attempts),
    locked: parsed.enabled,
  });
}

// ---------- Retour dans l'app : reverrouillage après le délai choisi ----------
let backgroundSince: number | null = null;
AppState.addEventListener('change', (status) => {
  if (status === 'background') backgroundSince = Date.now();
  if (status === 'active' && backgroundSince !== null) {
    const elapsed = Date.now() - backgroundSince;
    backgroundSince = null;
    if (shouldRelock(state.settings, elapsed)) setState({ locked: true });
  }
});

// ---------- Déverrouillage ----------

/** Vérifie le code. Vrai = déverrouillé. Faux = erreur comptée (l'attente éventuelle est dans `attempts`). */
export async function unlockWithPin(pin: string): Promise<boolean> {
  const record = parsePinRecord(await readLock('pin'));
  if (record && (await checkPin(pin, record, sha256))) {
    await writeLock('attempts', JSON.stringify(NO_ATTEMPTS));
    setState({ locked: false, attempts: NO_ATTEMPTS });
    return true;
  }
  const attempts = registerFailure(state.attempts, Date.now());
  await writeLock('attempts', JSON.stringify(attempts)); // survit à la fermeture de l'app
  setState({ attempts });
  return false;
}

/** Déverrouillage après une biométrie réussie (vérifiée par le téléphone). */
export async function unlockWithBiometrics(): Promise<void> {
  await writeLock('attempts', JSON.stringify(NO_ATTEMPTS));
  setState({ locked: false, attempts: NO_ATTEMPTS });
}

// ---------- Réglages (écran Sécurité) ----------

/** Active le verrouillage avec un nouveau code (déjà vérifié par pinProblem et confirmé deux fois). */
export async function enableLock(pin: string, biometrics: boolean): Promise<void> {
  const salt = Crypto.getRandomBytes(16).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  await writeLock('pin', JSON.stringify({ salt, hash: await hashPin(pin, salt, sha256) }));
  await saveSettings({ ...state.settings, enabled: true, biometrics, pinLength: pin.length });
}

export async function changePin(pin: string): Promise<void> {
  await enableLock(pin, state.settings.biometrics);
}

/** Vérifie un code SANS compter d'erreur ni déverrouiller (pour confirmer une action dans les réglages). */
export async function verifyPin(pin: string): Promise<boolean> {
  const record = parsePinRecord(await readLock('pin'));
  return record !== null && checkPin(pin, record, sha256);
}

export async function updateLockSettings(patch: Partial<LockSettings>): Promise<void> {
  await saveSettings({ ...state.settings, ...patch });
}

export async function disableLock(): Promise<void> {
  await clearLock();
  setState({ settings: DEFAULT_LOCK_SETTINGS, locked: false, attempts: NO_ATTEMPTS });
}

/** À la déconnexion : le verrouillage appartient au compte, il est effacé avec lui. */
export async function resetAppLock(): Promise<void> {
  await disableLock();
}

async function saveSettings(settings: LockSettings) {
  await writeLock('settings', JSON.stringify(settings));
  setState({ settings });
}
