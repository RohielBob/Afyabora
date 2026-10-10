// Appels aux routes /auth/* de l'API (contrat docs/api/openapi.v0.json). Aucune logique d'écran ici.
import type {
  DoctorVerificationStatus,
  LoginInput,
  RegisterDoctorInput,
  UserRole,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export interface MessageResponse {
  message: string;
}

/** Réponse de POST /auth/refresh (contrat : AuthTokens). */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** Réponse de POST /auth/login (contrat : LoginResponse). */
export interface LoginResponse extends AuthTokens {
  user: {
    id: string;
    role: UserRole;
    profileCompleted: boolean;
    doctorVerificationStatus?: DoctorVerificationStatus | null;
  };
}

export const authApi = {
  /** Toujours 202 avec le même message, que l'adresse soit nouvelle ou non (pas d'énumération). */
  registerDoctor: (input: RegisterDoctorInput) =>
    api<MessageResponse>('/auth/register-doctor', { method: 'POST', body: input, auth: false }),

  verifyEmail: (token: string) =>
    api<MessageResponse>('/auth/verify-email', { method: 'POST', body: { token }, auth: false }),

  login: (input: LoginInput) =>
    api<LoginResponse>('/auth/login', { method: 'POST', body: input, auth: false }),

  refresh: (refreshToken: string) =>
    api<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false }),

  /** Exige le jeton d'accès (fourni par le client HTTP) ; toujours 204. */
  logout: (refreshToken: string, accessToken?: string) =>
    api<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      // Jeton passé explicitement : utile quand la session n'est pas (ou plus) enregistrée.
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    }),

  /** Toujours 202, que le compte existe ou non. */
  forgotPassword: (email: string) =>
    api<MessageResponse>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    }),

  resetPassword: (token: string, password: string) =>
    api<MessageResponse>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      auth: false,
    }),
};
