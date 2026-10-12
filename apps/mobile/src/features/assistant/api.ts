// Appels /assistant/* (contrat docs/api/openapi.v0.json 0.4.0, L9-05 à L9-07 ; liste, effacement et fiches :
// L9-10). Les réponses sont vérifiées
// avec les schémas de @glyka/shared : une réponse inattendue devient une erreur, jamais un affichage faux.
import {
  assistantConversationDetailSchema,
  assistantConversationDtoSchema,
  assistantConversationListSchema,
  knowledgeSheetListSchema,
  knowledgeSheetSchema,
  sendAssistantMessageResponseSchema,
  type AssistantConversationDetail,
  type AssistantConversationDto,
  type AssistantConversationList,
  type KnowledgeSheet,
  type KnowledgeSheetList,
  type SendAssistantMessageResponse,
} from '@glyka/shared';
import { api } from '@/lib/api-client';

export const assistantApi = {
  /** Crée la conversation (identifiant créé sur le téléphone) : 201, ou 200 si elle existe déjà. */
  create: async (id: string): Promise<AssistantConversationDto> =>
    assistantConversationDtoSchema.parse(
      await api('/assistant/conversations', { method: 'POST', body: { id } }),
    ),
  /** La conversation et ses messages (404 si inconnue, effacée ou d'un autre patient). */
  get: async (id: string): Promise<AssistantConversationDetail> =>
    assistantConversationDetailSchema.parse(await api(`/assistant/conversations/${id}`)),
  /** Envoie une question (202), ou relit la même question déjà reçue (200, rejeu sans doublon). */
  send: async (
    conversationId: string,
    question: { id: string; text: string },
  ): Promise<SendAssistantMessageResponse> =>
    sendAssistantMessageResponseSchema.parse(
      await api(`/assistant/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: question,
      }),
    ),
  /** Mes conversations, la plus récemment utilisée d'abord ; page suivante avec `cursor` (L9-10). */
  list: async (cursor?: string): Promise<AssistantConversationList> =>
    assistantConversationListSchema.parse(
      await api(
        `/assistant/conversations?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    ),
  /** Efface une conversation et ses messages (effacement réel ; 404 si déjà effacée). */
  remove: (id: string) => api<void>(`/assistant/conversations/${id}`, { method: 'DELETE' }),
  /** Efface TOUTES mes conversations (204, même s'il n'y en a pas). */
  removeAll: () => api<void>('/assistant/conversations', { method: 'DELETE' }),
  /** Les fiches de connaissances servies, sans leur texte. */
  sheets: async (): Promise<KnowledgeSheetList> =>
    knowledgeSheetListSchema.parse(await api('/assistant/sheets')),
  /** Une fiche complète (404 si inconnue ou non servie). */
  sheet: async (id: string): Promise<KnowledgeSheet> =>
    knowledgeSheetSchema.parse(await api(`/assistant/sheets/${encodeURIComponent(id)}`)),
};
