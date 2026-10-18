// Appels /shares/* (contrat docs/api/openapi.v0.json, lot L5). La réponse est vérifiée avec le schéma de
// @glyka/shared : une réponse inattendue devient une erreur, jamais un QR faux.
import {
  accessLogListSchema,
  createShareResponseSchema,
  shareStatusResponseSchema,
  shareTokenSchema,
  type AccessLogList,
  type CreateShareInput,
  type CreateShareResponse,
  type ShareStatusResponse,
  type ShareTokenDto,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export const sharingApi = {
  /** POST /shares (L5-01) : session en attente de scan et son premier QR (jeton valable 60 s). */
  create: async (input: CreateShareInput): Promise<CreateShareResponse> =>
    createShareResponseSchema.parse(await api('/shares', { method: 'POST', body: input })),
  /** GET /shares/:id/token (L5-02) : nouveau QR ; 409 si la session n'attend plus de scan. */
  rotate: async (sessionId: string): Promise<ShareTokenDto> =>
    shareTokenSchema.parse(await api(`/shares/${sessionId}/token`)),
  /** GET /shares/:id/status (L5-04) : état, médecin, secondes restantes (horloge du serveur). */
  status: async (sessionId: string): Promise<ShareStatusResponse> =>
    shareStatusResponseSchema.parse(await api(`/shares/${sessionId}/status`)),
  /** GET /shares/log (L5-05) : journal d'accès, du plus récent au plus ancien, par pages (curseur). */
  log: async (cursor?: string): Promise<AccessLogList> =>
    accessLogListSchema.parse(
      await api(`/shares/log${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    ),
  /** DELETE /shares/:id (L5-04) : arrête le partage (le QR ne sert plus, l'accès éventuel est coupé). */
  revoke: async (sessionId: string): Promise<void> => {
    await api(`/shares/${sessionId}`, { method: 'DELETE' });
  },
};
