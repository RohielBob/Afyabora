// Reformulation des observations (L3-05) : la consigne envoyée au modèle, la lecture de sa réponse et les
// GARDE-FOUS qui décident, phrase par phrase, si la reformulation peut remplacer le gabarit du moteur.
// Fonctions pures (sans réseau), testées dans test/insights-llm.test.ts.
//
// Une reformulation est REFUSÉE (le gabarit est gardé) si elle :
//  - est vide ou trop longue ;
//  - ne contient pas EXACTEMENT les mêmes nombres que la phrase du moteur (un chiffre ajouté, enlevé ou
//    calculé = refus : tous les chiffres viennent du moteur, ADR-0005) ;
//  - contient un mot interdit : diagnostic, dose, insuline, traitement, médicament, cause affirmée,
//    ordre (« vous devez », « il faut »), alarme (« grave », « urgence »), « toujours » / « jamais »,
//    ou un lien.

/** Consignes données au modèle. Toute modification ⇒ rejouer les questions-pièges (L3-07). */
export const REPHRASE_SYSTEM = `Tu aides un patient diabétique à lire ses propres observations statistiques de glycémie.
Pour chaque observation, écris UNE phrase française, simple et bienveillante, au vouvoiement.

Règles absolues :
1. Recopie TOUS les nombres de l'observation, à l'identique (mêmes valeurs, même ordre, avec « % » si présent). N'en ajoute aucun, n'en calcule aucun.
2. Décris seulement ce qui est observé. Jamais de diagnostic, de cause, de dose, de médicament, de traitement, de conseil ni d'ordre.
3. Garde le sens exact : ne dis pas « toujours » ni « jamais » si l'observation ne le dit pas.

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

/** Mots et formules refusés (garde-fous de l'ADR-0005 et du CDC §5.5). */
const FORBIDDEN =
  /diagnos|\bdoses?\b|dosage|posologie|insuline|traitement|m[ée]dicament|prescri|vous devez|vous devriez|il faut|à cause|parce que|en raison|caus[ée]|provoqu|\bgraves?\b|urgen|danger|toujours|jamais|https?:|www\.|@/i;

/** Nombres d'une phrase, dans l'ordre (« 7,5 » et « 7.5 » sont le même nombre). */
export function numbersOf(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

/** Mêmes nombres, autant de fois chacun (l'ordre peut changer avec la tournure de la phrase). */
const sameNumbers = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join('|') === [...b].sort().join('|');

/** Raison du refus d'une reformulation (journalisée), ou null si elle peut remplacer le gabarit. */
export type RewriteProblem = 'empty' | 'too-long' | 'numbers' | 'forbidden';

export function checkRewrite(source: string, rewritten: string): RewriteProblem | null {
  if (rewritten.length === 0) return 'empty';
  if (rewritten.length > MAX_LENGTH) return 'too-long';
  if (!sameNumbers(numbersOf(source), numbersOf(rewritten))) return 'numbers';
  if (FORBIDDEN.test(rewritten)) return 'forbidden';
  return null;
}
