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

export const authApi = {
  /** Toujours 202 avec le même message, que l'adresse soit nouvelle ou non (pas d'énumération). */
  register: (input: RegisterPatientInput) =>
    api<MessageResponse>('/auth/register', { method: 'POST', body: input, auth: false }),

  verifyEmail: (token: string) =>
    api<MessageResponse>('/auth/verify-email', { method: 'POST', body: { token }, auth: false }),

  login: (input: LoginInput) =>
    api<LoginResponse>('/auth/login', { method: 'POST', body: input, auth: false }),

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
