// Réponse sur les MESURES du patient (L9-06) : uniquement les phrases du moteur `@glyka/analytics`
// (`analyzeLastDays` : le même calcul que l'écran Analyse, sur le téléphone comme sur le serveur).
// Aucun chiffre n'est calculé ici, aucune cause n'est affirmée : la réponse DÉCRIT les mesures et renvoie
// au professionnel de santé. Mise en mots par le modèle de langage (L9-07) : seulement le corps, vérifié ;
// le rappel final est toujours remis tel quel par le code.
import type { LastDaysAnalysis } from '@glyka/analytics';
import type { InsightType } from '@glyka/shared';
import { composeAnswer, type AnswerRewrite } from './answer-rewrite';

/** « … une valeur inhabituelle … » : ce que le moteur n'a PAS relevé, dit sans dramatiser. */
const NOT_OBSERVED: Record<InsightType, string> = {
  TREND: "Je n'observe pas d'évolution nette sur cette période.",
  TIME_OF_DAY_PATTERN:
    "Je n'observe pas de moment de la journée qui se distingue sur cette période.",
  REPEATED_HYPO: "Je n'observe pas de valeurs basses répétées sur cette période.",
  HIGH_STREAK: "Je n'observe pas de série de valeurs hautes sur cette période.",
  ANOMALY: "Je n'observe pas de valeur inhabituelle sur cette période.",
  PERIOD_COMPARISON: 'Il n’y a pas assez de mesures sur la période précédente pour comparer.',
  MISSING_DATA: "Je n'observe pas de jour sans mesure sur cette période.",
};

/** Rappel ajouté à toute réponse sur les mesures. */
export const MEASUREMENT_REMINDER =
  'Ces chiffres décrivent vos mesures, sans diagnostic : pour toute décision, parlez-en à votre professionnel de santé.';

/**
 * Réponse découpée pour la mise en mots (L9-07) : le corps (le résumé de la période, puis les observations
 * sur lesquelles la question insiste — `focus` —, ou ce qui n'a pas été observé), puis le rappel.
 */
export function measurementRewrite(
  analysis: LastDaysAnalysis,
  focus: readonly InsightType[],
): AnswerRewrite {
  const parts = [analysis.summary];
  if (analysis.stats !== null) {
    for (const type of focus) {
      const found = analysis.insights.filter((insight) => insight.type === type);
      // Le moteur produit TOUJOURS la comparaison quand les deux périodes ont assez de mesures : son
      // absence veut donc bien dire « pas assez de mesures sur la période précédente ».
      if (found.length > 0) parts.push(...found.map((insight) => insight.text));
      else parts.push(NOT_OBSERVED[type]);
    }
  }
  return { prefix: '', body: [...new Set(parts)].join(' '), suffix: ` ${MEASUREMENT_REMINDER}` };
}

/** Texte gabarit de la réponse : le corps et le rappel. */
export function measurementAnswer(
  analysis: LastDaysAnalysis,
  focus: readonly InsightType[],
): string {
  const rewrite = measurementRewrite(analysis, focus);
  return composeAnswer(rewrite, rewrite.body);
}
