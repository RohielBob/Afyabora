// Point d'entrée public de la feature « auth ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { authApi, type LoginResponse } from './api';
export { authErrorMessage, type ErrorMessage } from './errors';
export { extractToken } from './link-token';
export { pendingRegistration } from './pending-registration';
export {
  initSession,
  markProfileCompleted,
  refreshSession,
  signIn,
  signOut,
  useSession,
  type LoginDestination,
  type SessionState,
  type SessionUser,
} from './session';
export {
  PASSWORD_MIN_LENGTH,
  passwordChecks,
  validateEmail,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
  type FieldErrors,
} from './validation';
export { AuthHeader } from './components/AuthHeader';
export { PasswordChecklist } from './components/PasswordChecklist';
export { useCountdown } from './components/useCountdown';
export { FooterLink } from './components/FooterLink';
export { SuccessState } from './components/SuccessState';
