// Réponses GABARITS de l'assistant « Afyabora » (L9-05) : déterministes, sans modèle de langage, sans
// réseau. Première couche de protection de l'ADR-0005 (complément du 2026-10-11) : le filtre des questions
// de L3-07 (`screenQuestion`) décide AVANT tout le reste.
//  - urgence (malaise, glycémie très basse citée…) ⇒ EMERGENCY : message d'urgence immédiat ; le téléphone
//    affiche à côté le numéro d'urgence, le médecin et le proche du profil (L9-03, L9-09) ;
//  - dose, traitement, diagnostic, prédiction, détournement ⇒ REFUSAL : refus poli, renvoi au professionnel ;
//  - hors sujet ⇒ OUT_OF_SCOPE ;
//  - sinon ⇒ OUT_OF_SCOPE « pas de réponse sûre » : en L9-05, l'assistant n'a pas encore ses sources
//    (mesures et fiches : L9-06). Jamais d'invention.
import type { AssistantAnswerKind, KnowledgeSheetRef } from '@glyka/shared';
import { REFUSAL_ANSWERS, screenQuestion } from '../../insights/guardrails/question-guard';

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

/** Réponse gabarit à une question du patient. */
export function templateAnswer(question: string): AssistantAnswer {
  const verdict = screenQuestion(question);
  const answer = (kind: AssistantAnswerKind, text: string): AssistantAnswer => ({
    kind,
    text,
    sources: [],
    rephrased: false,
  });
  if (!verdict.refused) return answer('OUT_OF_SCOPE', ASSISTANT_TEMPLATES.noSafeAnswer);
  switch (verdict.reason) {
    case 'EMERGENCY':
      return answer('EMERGENCY', REFUSAL_ANSWERS.EMERGENCY);
    case 'OFF_TOPIC':
      return answer('OUT_OF_SCOPE', ASSISTANT_TEMPLATES.offTopic);
    default:
      return answer('REFUSAL', REFUSAL_ANSWERS[verdict.reason]);
  }
}
