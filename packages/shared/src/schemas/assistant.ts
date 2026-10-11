// Assistant de conversation « Afyabora » (lot L9, contrat 0.4.0, ADR-0005 complétée le 2026-10-11).
// Mêmes schémas pour l'API (validation des requêtes) et le mobile (lecture des réponses).
//
// Rappel des règles (ADR-0005) : les chiffres viennent de @glyka/analytics, les réponses générales viennent
// UNIQUEMENT de fiches de connaissances relues par un médecin ; jamais de dose, de diagnostic, de traitement
// ni de prédiction ; une urgence reçoit un message d'urgence sans passer par le modèle de langage.
import { z } from 'zod';
import {
  ASSISTANT_ANSWER_KINDS,
  ASSISTANT_MESSAGE_ROLES,
  ASSISTANT_MESSAGE_STATUSES,
  KNOWLEDGE_SHEET_STATUSES,
} from '../enums';

const dateTime = z.string().datetime({ offset: true });

/** Longueur maximale d'une question du patient (même limite que l'ancienne question libre L3-08). */
export const ASSISTANT_QUESTION_MAX_LENGTH = 500;

/** Identifiant lisible d'une fiche : minuscules, chiffres et tirets (« hypoglycemie », « hba1c »). */
export const knowledgeSheetIdSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "L'identifiant d'une fiche ne contient que des minuscules, des chiffres et des tirets",
  });

// ---------------------------------------------------------------- Requêtes

/**
 * POST /assistant/conversations : l'identifiant est créé sur le téléphone (comme pour les mesures), ce qui
 * rend la création rejouable sans doublon.
 */
export const createAssistantConversationSchema = z.object({
  id: z.string().uuid(),
});
export type CreateAssistantConversationInput = z.infer<typeof createAssistantConversationSchema>;

/** POST /assistant/conversations/{id}/messages : la question du patient, identifiée par un UUID du téléphone. */
export const sendAssistantMessageSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(2).max(ASSISTANT_QUESTION_MAX_LENGTH),
});
export type SendAssistantMessageInput = z.infer<typeof sendAssistantMessageSchema>;

/** GET /assistant/conversations?limit=20&cursor=… */
export const assistantListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Curseur opaque renvoyé par la page précédente. */
  cursor: z.string().max(500).optional(),
});
export type AssistantListQuery = z.infer<typeof assistantListQuerySchema>;

// ---------------------------------------------------------------- Réponses

/** Fiche citée par une réponse (le téléphone l'affiche comme un lien vers la fiche). */
export const knowledgeSheetRefSchema = z.object({
  id: knowledgeSheetIdSchema,
  title: z.string(),
  status: z.enum(KNOWLEDGE_SHEET_STATUSES),
});
export type KnowledgeSheetRef = z.infer<typeof knowledgeSheetRefSchema>;

/**
 * Un message de la conversation.
 * - Question du patient : `role: USER`, `status: READY`, `kind: null`, `sources: []`.
 * - Réponse en préparation : `role: ASSISTANT`, `status: PENDING`, `text: null`, `kind: null`.
 * - Réponse définitive : `status: READY`, `text` et `kind` renseignés, fiches citées dans `sources`.
 * `rephrased` : vrai si la phrase a été mise en mots par le modèle de langage ET a passé toutes les
 * vérifications ; faux pour une réponse gabarit (modèle absent, trop lent, ou réponse rejetée).
 */
export const assistantMessageDtoSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(ASSISTANT_MESSAGE_ROLES),
  status: z.enum(ASSISTANT_MESSAGE_STATUSES),
  kind: z.enum(ASSISTANT_ANSWER_KINDS).nullable(),
  text: z.string().nullable(),
  sources: z.array(knowledgeSheetRefSchema),
  rephrased: z.boolean(),
  createdAt: dateTime,
});
export type AssistantMessageDto = z.infer<typeof assistantMessageDtoSchema>;

/** Une conversation dans la liste : aucun titre stocké en clair, `preview` = début de la 1re question. */
export const assistantConversationDtoSchema = z.object({
  id: z.string().uuid(),
  preview: z.string().max(80),
  messageCount: z.number().int().min(0),
  createdAt: dateTime,
  updatedAt: dateTime,
});
export type AssistantConversationDto = z.infer<typeof assistantConversationDtoSchema>;

export const assistantConversationListSchema = z.object({
  items: z.array(assistantConversationDtoSchema),
  nextCursor: z.string().nullable(),
});
export type AssistantConversationList = z.infer<typeof assistantConversationListSchema>;

/** GET /assistant/conversations/{id} : la conversation et ses messages, du plus ancien au plus récent. */
export const assistantConversationDetailSchema = assistantConversationDtoSchema.extend({
  messages: z.array(assistantMessageDtoSchema),
});
export type AssistantConversationDetail = z.infer<typeof assistantConversationDetailSchema>;

/** Réponse de POST /assistant/conversations/{id}/messages : la question enregistrée et la réponse. */
export const sendAssistantMessageResponseSchema = z.object({
  question: assistantMessageDtoSchema,
  answer: assistantMessageDtoSchema,
});
export type SendAssistantMessageResponse = z.infer<typeof sendAssistantMessageResponseSchema>;

/** Source publique d'une fiche (recommandation officielle). */
export const knowledgeSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

/** Une fiche dans la liste (GET /assistant/sheets). */
export const knowledgeSheetSummarySchema = z.object({
  id: knowledgeSheetIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(KNOWLEDGE_SHEET_STATUSES),
  version: z.number().int().min(1),
  /** Date de la relecture par le médecin ; null tant que la fiche est en brouillon. */
  reviewedOn: z.string().date().nullable(),
});
export type KnowledgeSheetSummary = z.infer<typeof knowledgeSheetSummarySchema>;

export const knowledgeSheetListSchema = z.object({
  items: z.array(knowledgeSheetSummarySchema),
});
export type KnowledgeSheetList = z.infer<typeof knowledgeSheetListSchema>;

/** Une fiche complète (GET /assistant/sheets/{sheetId}) : texte en Markdown simple et sources. */
export const knowledgeSheetSchema = knowledgeSheetSummarySchema.extend({
  body: z.string().min(1),
  sources: z.array(knowledgeSourceSchema).min(1),
  /** Médecin qui a relu la fiche ; null tant qu'elle est en brouillon. */
  reviewedBy: z.string().nullable(),
});
export type KnowledgeSheet = z.infer<typeof knowledgeSheetSchema>;
