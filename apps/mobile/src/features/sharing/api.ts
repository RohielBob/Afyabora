// Appels /shares/* (contrat docs/api/openapi.v0.json, lot L5). La réponse est vérifiée avec le schéma de
// @glyka/shared : une réponse inattendue devient une erreur, jamais un QR faux.
import {
  createShareResponseSchema,
  type CreateShareInput,
  type CreateShareResponse,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export const sharingApi = {
  /** POST /shares (L5-01) : session en attente de scan et son premier QR (jeton valable 60 s). */
  create: async (input: CreateShareInput): Promise<CreateShareResponse> =>
    createShareResponseSchema.parse(await api('/shares', { method: 'POST', body: input })),
};
