// Appels /assistant/* (contrat docs/api/openapi.v0.json 0.4.0, L9-05 à L9-07). Les réponses sont vérifiées
// avec les schémas de @glyka/shared : une réponse inattendue devient une erreur, jamais un affichage faux.
import {
  assistantConversationDetailSchema,
  assistantConversationDtoSchema,
  sendAssistantMessageResponseSchema,
  type AssistantConversationDetail,
  type AssistantConversationDto,
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
};
