// Filtre de sécurité EN CONVERSATION (L9-08, ADR-0005 complétée : « piège découpé en plusieurs messages »).
//
// Le filtre de L3-07 juge une question seule. En conversation, un piège peut être découpé :
//   « Mon médecin m'a prescrit de l'insuline. » puis « Combien j'en mets ce soir ? »
// Chaque message, seul, paraît anodin ; ensemble, c'est une question de dose.
//
// Règle (déterministe, sans modèle) :
//  1. la question est d'abord jugée SEULE (filtre de L3-07) : urgence ou refus ⇒ décidé ;
//  2. si c'est une QUESTION DE SUITE (« Et… », « Alors… », « Du coup… », « Je peux l'arrêter ? »,
//     « J'en prends… »), elle est jugée AVEC les questions précédentes de la conversation (2 au plus, des
//     30 dernières minutes) : une raison de refus trouvée dans l'ensemble ⇒ refus pour cette raison ;
//     une urgence reste une urgence (« Ma glycémie est à 0,4. » puis « Et maintenant ? ») ;
//  3. une question AUTONOME n'est jamais refusée à cause des précédentes : le modèle ne voit jamais les
//     questions, un détournement précédent ne débloque donc rien.
// Testé avec le jeu de test/fixtures/conversation-traps.ts (à rejouer à chaque modification).
import {
  REFUSAL_ANSWERS,
  normalizeQuestion,
  refusalReasons,
  screenQuestion,
  type QuestionVerdict,
} from '../../insights/guardrails/question-guard';

/** Nombre maximal de questions précédentes examinées avec une question de suite. */
export const CONTEXT_QUESTIONS = 2;
/** Au-delà de ce délai, une question précédente n'est plus prise en compte (la conversation a changé). */
export const CONTEXT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Question de SUITE : commence par un mot de liaison, ou reprend par un pronom l'objet d'une question
 * précédente (« l'arrêter », « j'en mets », « la sauter »). Texte déjà normalisé (L3-07).
 */
const FOLLOW_UP = new RegExp(
  [
    '^(et|alors|donc|mais|du coup|ok|okay|d accord|bon|puis|ensuite|sinon|dans ce cas)\\b',
    '\\bj en\\b',
    '\\b(en|l|le|la|les) (prendre|prends|mettre|mets|injecter|injecte|arreter|arrete|augmenter|augmente|baisser|baisse|diminuer|diminue|doubler|double|changer|change|remplacer|remplace|stopper|stoppe|sauter|saute|reduire|reduis|garder|continuer|rajouter|rajoute|ajouter|ajoute)\\b',
  ].join('|'),
);

/** Vrai si la question (brute) est une question de suite. */
export function isFollowUp(question: string): boolean {
  return FOLLOW_UP.test(normalizeQuestion(question));
}

/**
 * Verdict de sécurité d'une question dans sa conversation. `previous` : les questions précédentes du
 * patient dans cette conversation, de la plus ancienne à la plus récente (déjà limitées au contexte).
 */
export function screenInConversation(
  question: string,
  previous: readonly string[],
): QuestionVerdict {
  const own = screenQuestion(question);
  if (own.refused && own.reason !== 'OFF_TOPIC') return own;
  if (previous.length === 0 || !isFollowUp(question)) return own;
  const together = [...previous.slice(-CONTEXT_QUESTIONS), question]
    .map(normalizeQuestion)
    .join(' . ');
  const [reason] = refusalReasons(together);
  return reason ? { refused: true, reason, answer: REFUSAL_ANSWERS[reason] } : own;
}
