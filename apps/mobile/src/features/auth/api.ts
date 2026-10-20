// Appels aux routes /auth/* de l'API (contrat docs/api/openapi.v0.json). Aucune logique d'écran ici.
import type {
  LoginInput,
  RegisterPatientInput,
  DoctorVerificationStatus,
  UserRole,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export interface MessageResponse {
  message: string;
}

/** Réponse de POST /auth/login (contrat : LoginResponse). */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    role: UserRole;
    profileCompleted: boolean;
    doctorVerificationStatus: DoctorVerificationStatus | null;
  };
}

/**
 * Délai des écrans sans compte (inscription, connexion…) : plus long que celui des autres requêtes, car le
 * serveur hébergé peut mettre jusqu'à une minute à se réveiller (src/lib/server-wake.ts). Le bouton montre
 * son indicateur de chargement pendant ce temps.
 */
const AUTH_TIMEOUT_MS = 75_000;

export const authApi = {
  /** Toujours 202 avec le même message, que l'adresse soit nouvelle ou non (pas d'énumération). */
  register: (input: RegisterPatientInput) =>
    api<MessageResponse>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
      timeoutMs: AUTH_TIMEOUT_MS,
    }),

  verifyEmail: (token: string) =>
    api<MessageResponse>('/auth/verify-email', {
      method: 'POST',
      body: { token },
      auth: false,
      timeoutMs: AUTH_TIMEOUT_MS,
    }),

  login: (input: LoginInput) =>
    api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
      timeoutMs: AUTH_TIMEOUT_MS,
    }),

  /** Toujours 202, que le compte existe ou non. */
  forgotPassword: (email: string) =>
    api<MessageResponse>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
      timeoutMs: AUTH_TIMEOUT_MS,
    }),

  resetPassword: (token: string, password: string) =>
    api<MessageResponse>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      auth: false,
      timeoutMs: AUTH_TIMEOUT_MS,
    }),
};
