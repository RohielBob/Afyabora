// Reformulation des observations (L3-05) : la consigne envoyée au modèle, la lecture de sa réponse et les
// GARDE-FOUS qui décident, phrase par phrase, si la reformulation peut remplacer le gabarit du moteur.
// Fonctions pures (sans réseau), testées dans test/insights-llm.test.ts.
//
// Une reformulation est REFUSÉE (le gabarit est gardé) si elle :
//  - est vide ou trop longue ;
//  - ne contient pas EXACTEMENT les mêmes nombres que la phrase du moteur (un chiffre ajouté, enlevé ou
//    calculé = refus : tous les chiffres viennent du moteur, ADR-0005) ;
//  - n'a pas le même nombre de NÉGATIONS (« ne », « n' », « pas », « aucun », « sans », « hors »…) :
//    « Temps dans la cible : 0 % » devenu « pas dans la cible 0 % du temps » dit l'INVERSE (vu au banc
//    d'essai de L3-05 avec llama3.1, avec les bons chiffres) ;
//  - contient un mot interdit : diagnostic, dose, insuline, traitement, médicament, cause affirmée,
//    ordre (« vous devez », « il faut »), alarme (« grave », « urgence »), « toujours » / « jamais »,
//    « vous avez observé » (c'est l'application qui observe), ou un lien ;
//  - perd le rappel « professionnel de santé » que contenait la phrase du moteur (résumé, L3-06).

/** Consignes données au modèle. Toute modification ⇒ rejouer les questions-pièges (L3-07). */
export const REPHRASE_SYSTEM = `Tu aides un patient diabétique à lire ses propres observations statistiques de glycémie.
Pour chaque observation, écris UNE phrase française, simple et bienveillante, au vouvoiement.

Règles absolues :
1. Recopie TOUS les nombres de l'observation, à l'identique (mêmes valeurs, même ordre, avec « % » si présent). N'en ajoute aucun, n'en calcule aucun.
2. Décris seulement ce qui est observé. Jamais de diagnostic, de cause, de dose, de médicament, de traitement, de conseil ni d'ordre.
3. Garde le sens exact : n'ajoute et n'enlève aucune négation (« ne… pas », « aucun », « sans »), ne dis pas « toujours » ni « jamais ».
4. C'est l'application qui observe, pas le patient : n'écris jamais « vous avez observé ». Garde les guillemets « » tels quels.

Exemple :
Observation : Temps dans la cible : 62 % (période précédente : 55 %).
Réponse : Vos mesures étaient dans la cible 62 % du temps, contre 55 % sur la période précédente.

Réponds uniquement en JSON : {"textes": ["..."]}, autant de phrases que d'observations, dans le même ordre.`;

/** Demande au modèle : seulement les phrases du moteur, numérotées (aucun identifiant, aucune date). */
export function buildPrompt(sentences: readonly string[]): string {
  return [
    `Observations (${sentences.length}) :`,
    ...sentences.map((sentence, i) => `${i + 1}. ${sentence}`),
  ].join('\n');
}

/**
 * Phrases renvoyées par le modèle, dans l'ordre ; null si la réponse n'est pas le JSON attendu ou n'a pas
 * autant de phrases que demandé (on ne devine jamais quelle phrase correspond à quelle observation).
 */
export function parseTexts(raw: string, expected: number): string[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const texts = (data as { textes?: unknown } | null)?.textes;
  if (!Array.isArray(texts) || texts.length !== expected) return null;
  if (!texts.every((t): t is string => typeof t === 'string')) return null;
  return texts.map((t) => t.replace(/\s+/g, ' ').trim());
}

/** Longueur maximale d'une reformulation (une phrase courte). */
export const MAX_LENGTH = 280;
/** Longueur maximale du résumé reformulé (un court paragraphe). */
export const MAX_SUMMARY_LENGTH = 900;

/** Consignes pour le RÉSUMÉ de la période (L3-06). Toute modification ⇒ rejouer L3-07. */
export const SUMMARY_SYSTEM = `Tu aides un patient diabétique à lire le résumé statistique de ses propres mesures de glycémie.
Réécris ce résumé en un court paragraphe de 3 à 5 phrases, en français simple et bienveillant, au vouvoiement.

Règles absolues :
1. Recopie TOUS les nombres du résumé, à l'identique (mêmes valeurs, avec « % » et « /100 » si présents). N'en ajoute aucun, n'en calcule aucun.
2. Décris seulement ce qui est observé. Jamais de diagnostic, de cause, de dose, de médicament, de traitement, de conseil ni d'ordre.
3. Garde le sens exact : n'ajoute et n'enlève aucune négation (« ne… pas », « aucun », « sans »), ne dis pas « toujours » ni « jamais ».
4. C'est l'application qui observe, pas le patient : n'écris jamais « vous avez observé ».
5. Si le résumé parle de votre professionnel de santé, garde ce rappel.

Réponds uniquement en JSON : {"texte": "..."}.`;

/** Demande pour le résumé : seulement le résumé du moteur (faits agrégés, aucun identifiant). */
export function buildSummaryPrompt(summary: string): string {
  return `Résumé à réécrire :\n${summary}`;
}

/** Résumé renvoyé par le modèle, ou null si la réponse n'est pas le JSON attendu. */
export function parseSummary(raw: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const text = (data as { texte?: unknown } | null)?.texte;
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : null;
}

/** Mots et formules refusés (garde-fous de l'ADR-0005 et du CDC §5.5). */
const FORBIDDEN =
  /diagnos|\bdoses?\b|dosage|posologie|insuline|traitement|m[ée]dicament|prescri|vous devez|vous devriez|il faut|à cause|parce que|en raison|caus[ée]|provoqu|\bgraves?\b|urgen|danger|toujours|jamais|vous avez observ|https?:|www\.|@/i;

/** Marques de négation : « ne », « n' », « pas », « aucun(e) », « rien », « sans », « hors ». */
const NEGATION = /\b(?:ne|pas|aucune?|rien|sans|hors)\b|\bn['’]/gi;

/** Nombre de négations d'une phrase. */
export function negationsOf(text: string): number {
  return (text.match(NEGATION) ?? []).length;
}

/** Rappel qu'une reformulation ne doit jamais perdre (résumé : points à examiner avec le médecin). */
const KEPT_REMINDER = /professionnel de santé/i;

/** Nombres d'une phrase, dans l'ordre (« 7,5 » et « 7.5 » sont le même nombre). */
export function numbersOf(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

/** Mêmes nombres, autant de fois chacun (l'ordre peut changer avec la tournure de la phrase). */
const sameNumbers = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join('|') === [...b].sort().join('|');

/** Raison du refus d'une reformulation (journalisée), ou null si elle peut remplacer le gabarit. */
export type RewriteProblem =
  'empty' | 'too-long' | 'numbers' | 'negation' | 'forbidden' | 'reminder';

export function checkRewrite(
  source: string,
  rewritten: string,
  maxLength: number = MAX_LENGTH,
): RewriteProblem | null {
  if (rewritten.length === 0) return 'empty';
  if (rewritten.length > maxLength) return 'too-long';
  if (!sameNumbers(numbersOf(source), numbersOf(rewritten))) return 'numbers';
  if (negationsOf(source) !== negationsOf(rewritten)) return 'negation';
  if (FORBIDDEN.test(rewritten)) return 'forbidden';
  if (KEPT_REMINDER.test(source) && !KEPT_REMINDER.test(rewritten)) return 'reminder';
  return null;
}
