// Appels /emergency (L6-05, contrat docs/api/openapi.v0.json). Chaque réponse est vérifiée avec le schéma de
// @glyka/shared : une réponse inattendue devient une erreur, jamais une carte fausse.
import {
  emergencyCardResponseSchema,
  emergencyQrResponseSchema,
  type EmergencyCardInput,
  type EmergencyCardResponse,
  type EmergencyQrResponse,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export const emergencyApi = {
  /** GET /emergency : la carte (créée vide et désactivée à la première lecture). */
  get: async (): Promise<EmergencyCardResponse> =>
    emergencyCardResponseSchema.parse(await api('/emergency')),
  /** PUT /emergency : remplace toute la carte (un champ absent est effacé). */
  save: async (input: EmergencyCardInput): Promise<EmergencyCardResponse> =>
    emergencyCardResponseSchema.parse(await api('/emergency', { method: 'PUT', body: input })),
  /** POST /emergency/regenerate : nouveau QR ; le jeton n'est montré qu'ici, l'ancien QR ne marche plus. */
  regenerate: async (): Promise<EmergencyQrResponse> =>
    emergencyQrResponseSchema.parse(await api('/emergency/regenerate', { method: 'POST' })),
};
