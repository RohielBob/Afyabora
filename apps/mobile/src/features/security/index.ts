// Point d'entrée public de la feature « security » (verrouillage de l'app, L1-09).
export {
  changePin,
  disableLock,
  enableLock,
  initAppLock,
  resetAppLock,
  updateLockSettings,
  useAppLock,
  verifyPin,
  type AppLockState,
} from './app-lock';
export { biometricSupport, type BiometricKind, type BiometricSupport } from './biometrics';
export {
  LOCK_TIMEOUTS,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  pinProblem,
  type LockSettings,
  type LockTimeout,
  type PinProblem,
} from './lock-rules';
export { LockScreen } from './components/LockScreen';
export { PinPad, type PinPadHandle } from './components/PinPad';
