// Appels /me/profile (contrat docs/api/openapi.v0.json, L1-05 et L1-08).
import type { PatientProfileInput } from '@glyka/shared';
import { api } from '@/lib/api-client';

export type PatientProfileResponse = PatientProfileInput & { updatedAt: string };

export const profileApi = {
  /** 404 tant que le profil n'est pas créé. */
  get: () => api<PatientProfileResponse>('/me/profile'),
  /** Crée ou remplace tout le profil. */
  save: (input: PatientProfileInput) =>
    api<PatientProfileResponse>('/me/profile', { method: 'PUT', body: input }),
};
