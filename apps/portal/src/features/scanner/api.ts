// POST /shares/claim (L5-03) : le médecin consomme le QR du patient ; l'accès s'ouvre. La réponse est
// vérifiée avec le schéma de @glyka/shared : une réponse inattendue devient une erreur.
import { claimShareResponseSchema, type ClaimShareResponse } from '@glyka/shared';
import { api } from '@/lib/api-client';

export const scannerApi = {
  claim: async (token: string): Promise<ClaimShareResponse> =>
    claimShareResponseSchema.parse(await api('/shares/claim', { method: 'POST', body: { token } })),
};
