// Point d'entrée public de la feature « auth » du portail (L1-11).
export { authApi, type LoginResponse } from './api';
export { GuestOnly, PendingOnly, RequireApproved, RequireDoctor } from './guards';
export {
  IDLE_LIMIT_MS,
  PATHS,
  authErrorMessage,
  destinationFor,
  doctorPayload,
  tokenFromSearch,
  validateDoctorSignUp,
  validateEmail,
  validateNewPassword,
  validateSignIn,
  type DoctorSignUpValues,
  type FieldErrors,
  type PortalUser,
} from './rules';
export {
  getSession,
  initSession,
  refreshSession,
  signIn,
  signOut,
  subscribeSession,
  useSession,
  type SessionState,
  type SignedOutReason,
} from './session';
