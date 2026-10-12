// Réponses GABARITS de l'assistant « Afyabora » (L9-05) : forme d'une réponse et textes fixes. L'ordre de
// décision (filtre de sécurité, mesures, fiches) est dans `assistant-responder.service.ts` (L9-06).
import type { AssistantAnswerKind, KnowledgeSheetRef } from '@glyka/shared';

/** Réponse de l'assistant, avant enregistrement. */
export interface AssistantAnswer {
  kind: AssistantAnswerKind;
  text: string;
  sources: KnowledgeSheetRef[];
  /** Vrai seulement pour une phrase mise en mots par le modèle de langage ET vérifiée (L9-07). */
  rephrased: boolean;
}

/** Textes propres à l'assistant (les refus reprennent ceux de L3-07, déjà relus). */
export const ASSISTANT_TEMPLATES = {
  /** Question hors du suivi du diabète. */
  offTopic:
    'Je réponds seulement aux questions sur vos mesures de glycémie et sur le diabète, à partir de fiches relues par un médecin. Pour toute autre question de santé, parlez-en à votre professionnel de santé.',
  /** Aucune source sûre pour répondre : on le dit, sans jamais inventer. */
  noSafeAnswer:
    "Je n'ai pas de réponse sûre à cette question pour l'instant. Je réponds seulement à partir de vos mesures et de fiches relues par un médecin. Parlez-en à votre professionnel de santé.",
} as const;
