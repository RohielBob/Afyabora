// Tri des questions de l'assistant (L9-06, couche 2 de l'ADR-0005 complétée) : fait par le CODE, jamais
// par le modèle de langage. Après le filtre de sécurité (L3-07), une question est :
//  - sur les MESURES du patient (« comment s'est passée ma semaine ? », « mes glycémies du soir ») ;
//  - sinon une question GÉNÉRALE, cherchée dans les fiches (sheet-answer.ts) ;
//  - sinon sans réponse sûre.
// Tout se joue sur le texte normalisé (minuscules, sans accents) : voir `normalizeQuestion` (L3-07).
import type { InsightType } from '@glyka/shared';

/** « mes », « ma », « mon » : la question parle du patient lui-même. */
const PERSONAL = /\b(mes|ma|mon|j ai|je suis)\b/;
/** Ce que le patient mesure. */
const GLUCOSE =
  /\b(glycemies?|mesures?|resultats?|chiffres|valeurs?|sucre|taux|hypos?|hypoglycemies?|hyperglycemies?|trop (bas|basse|haut|haute)|eleve\w*)\b/;
/** Le patient demande un bilan de SON historique (période, statistique, moment, comparaison). */
const HISTORY =
  /\b(semaines?|mois|jours?|derniers?|dernieres?|recemment|ces temps|moyennes?|tendances?|evolu\w*|progres|comment (s est passee?|vont|va|sont)|temps dans la cible|combien de fois|souvent|soir|soirs|matins?|nuits?|midi|analyse|bilan|resume|periodes?|compar\w*|hier|aujourd hui|historique)\b/;
/** « mes mesures », « mes glycémies », « mes résultats » : un bilan, même sans précision de période. */
const MY_DATA = /\b(mes|ma) (mesures|glycemies|resultats|chiffres|valeurs|analyse)\b/;
/** « ma semaine », « mon mois » : un bilan de la période. */
const MY_PERIOD = /\b(ma|mon) (semaine|mois|journee|quinzaine|trimestre)\b/;
/** Demande d'explication (« comment lire… », « c'est quoi… ») : une question GÉNÉRALE, pour les fiches. */
const GENERAL =
  /\b(c est quoi|qu est ce|que (veut|veulent) dire|signifi\w*|comment (lire|comprendre|calculer|convertir|interpreter)|definition|expliqu\w*)\b/;

/** La question porte-t-elle sur les mesures du patient (et non sur le diabète en général) ? */
export function isMeasurementQuestion(normalized: string): boolean {
  if (GENERAL.test(normalized)) return false;
  if (MY_DATA.test(normalized) || MY_PERIOD.test(normalized)) return true;
  return PERSONAL.test(normalized) && GLUCOSE.test(normalized) && HISTORY.test(normalized);
}

/** Période demandée, en jours (celles de l'écran Analyse) ; 30 jours si rien n'est précisé. */
export function periodOf(normalized: string): 7 | 14 | 30 | 90 {
  if (/\b(3|trois) mois\b|\btrimestre\b|\b90 jours\b/.test(normalized)) return 90;
  if (/\b(2|deux) semaines\b|\b(14|quinze|15) (derniers )?jours\b|\bquinzaine\b/.test(normalized)) {
    return 14;
  }
  if (
    /\bsemaine\b|\b7 (derniers )?jours\b|\bsept (derniers )?jours\b|\bces derniers jours\b/.test(
      normalized,
    )
  ) {
    return 7;
  }
  return 30;
}

/** Ce sur quoi la question insiste : les observations du moteur à mettre en avant. */
const FOCUS: readonly [InsightType, RegExp][] = [
  [
    'TIME_OF_DAY_PATTERN',
    /\b(soirs?|matins?|nuits?|midi|moments? de la journee|apres les repas|au coucher)\b/,
  ],
  ['REPEATED_HYPO', /\b(hypos?|hypoglycemies?|trop bas\w*|basses?|bas)\b/],
  ['HIGH_STREAK', /\b(trop haut\w*|hautes?|elevees?|hyperglycemies?|hypers?)\b/],
  ['TREND', /\b(tendances?|evolu\w*|augment\w*|diminu\w*|progres\w*|monte\w*|descend\w*)\b/],
  ['ANOMALY', /\b(inhabituel\w*|bizarres?|etranges?|anormal\w*|surprenant\w*)\b/],
  ['PERIOD_COMPARISON', /\b(compar\w*|precedent\w*|mieux|moins bien|pire)\b/],
  ['MISSING_DATA', /\b(oubli\w*|manqu\w*|sans mesure|trous?)\b/],
];

export function focusOf(normalized: string): InsightType[] {
  return FOCUS.filter(([, pattern]) => pattern.test(normalized)).map(([type]) => type);
}
