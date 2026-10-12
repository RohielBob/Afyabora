// Mise en mots d'une réponse de l'assistant par le modèle de langage LOCAL (L9-07, ADR-0005 complétée) :
// la consigne, la demande, et la VÉRIFICATION de ce que le modèle renvoie. Fonctions pures (sans réseau),
// testées dans test/assistant-rewrite.test.ts.
//
// Ce que reçoit le modèle : SEULEMENT le corps de la réponse gabarit déjà construite par le code (phrases
// du moteur `@glyka/analytics`, ou extrait d'une fiche). Jamais la question du patient (un piège glissé
// dans la question ne peut donc pas atteindre le modèle), jamais un nom, un identifiant ou une date.
// Ce que le modèle NE touche PAS : la citation de la fiche (« D'après la fiche … ») et le rappel final
// (« parlez-en à votre professionnel de santé »), remis tels quels par le code autour de son texte.
//
// Une mise en mots est REFUSÉE (la réponse gabarit est gardée) si elle :
//  - est vide, trop longue, ou trop courte (elle a perdu une partie de la réponse) ;
//  - n'est pas en français ;
//  - n'a pas EXACTEMENT les mêmes nombres que le gabarit (seuils, pourcentages, « 15 g »…) ; le « 1 »
//    collé à une lettre (« HbA1c ») n'est pas un nombre ;
//  - n'a pas le même nombre de NÉGATIONS (« ne pas conduire » ne doit jamais devenir « conduire », « non
//    allégé » jamais « allégé ») ; « ne … pas » compte pour une seule, comme « aucun » ;
//  - contient un mot interdit des garde-fous de L3-05 (dose, diagnostic, ordre, alarme, lien…) ABSENT du
//    gabarit : une fiche peut parler de « traitement », le modèle ne doit pas en ajouter ;
//  - cite une fiche, ou met entre guillemets « » un texte qui n'est pas dans le gabarit (fausse source) ;
//  - affirme un diagnostic ou spécule sur le patient (« vous êtes en hypoglycémie chronique », « vous avez
//    probablement… ») sans que le gabarit le dise (erreurs volontaires de L9-08) ;
//  - apporte trop de mots nouveaux (le modèle ajoute des informations au lieu de reformuler), en tout ou
//    dans UNE phrase (un conseil inventé ajouté à la fin d'une longue réponse, L9-08).
import { FORBIDDEN_PATTERNS } from '../../insights/llm/rephrase';

/** Ce que le modèle peut reformuler, et ce que le code remet autour, tel quel. */
export interface AnswerRewrite {
  /** Remis AVANT le texte du modèle (citation et résumé de la fiche), ou vide. */
  prefix: string;
  /** Le corps du gabarit : seule partie envoyée au modèle. */
  body: string;
  /** Remis APRÈS le texte du modèle (rappel du professionnel de santé). */
  suffix: string;
}

/** Réponse complète à partir d'un corps (celui du gabarit, ou celui du modèle s'il est accepté). */
export function composeAnswer(rewrite: AnswerRewrite, body: string): string {
  return `${rewrite.prefix}${body}${rewrite.suffix}`;
}

/** Consignes données au modèle. Toute modification ⇒ rejouer le banc d'essai et les questions-pièges. */
export const ANSWER_SYSTEM = `Tu es Afyabora, l'assistant d'une application de suivi du diabète. Tu réécris un texte déjà vérifié pour qu'il se lise comme une réponse naturelle à un patient.
Écris en français simple et bienveillant, au vouvoiement, en 2 à 6 phrases courtes. Garde les paragraphes si c'est plus clair.

Règles absolues :
1. Recopie TOUS les nombres du texte, à l'identique, avec leurs unités (mg/dL, %, g, minutes). N'en ajoute aucun, n'en calcule aucun.
2. N'ajoute AUCUNE information absente du texte : pas de conseil, pas d'exemple, pas de cause, pas de diagnostic, pas de dose, pas de médicament.
3. Garde le sens exact : chaque négation (« ne… pas », « aucun », « sans ») reste une négation ; n'en ajoute aucune.
4. Ne parle ni de fiche, ni de source, ni de toi-même. Ne mets entre guillemets « » que ce qui l'est déjà dans le texte.
5. Commence directement par le contenu : ni introduction, ni conclusion, ni salutation, ni rappel de consulter (l'application les ajoute elle-même).

Réponds uniquement en JSON : {"texte": "..."}.`;

/** Demande envoyée au modèle : le corps du gabarit, rien d'autre. */
export function buildAnswerPrompt(body: string): string {
  return `Texte à réécrire :\n${body}`;
}

/** Longueur maximale absolue d'une mise en mots. */
export const MAX_ANSWER_LENGTH = 1200;
/** Une mise en mots ne peut pas dépasser 1,6 fois le gabarit (+ 120 caractères de marge pour un texte court). */
export const LENGTH_FACTOR = 1.6;
/** … ni être plus courte que 45 % du gabarit (elle aurait perdu une partie de la réponse). */
export const MIN_LENGTH_RATIO = 0.45;
/** Part maximale de mots « nouveaux » (absents du gabarit) parmi les mots longs de la mise en mots. */
export const MAX_NEW_WORDS_RATIO = 0.3;
/** Part maximale de mots nouveaux dans UNE phrase (d'au moins MIN_SENTENCE_WORDS mots longs). */
export const MAX_SENTENCE_NEW_WORDS_RATIO = 0.6;
/** Une phrase plus courte (en mots longs) n'est pas jugée seule : trop peu de mots pour conclure. */
export const MIN_SENTENCE_WORDS = 4;

/** Raison du refus d'une mise en mots (écrite dans le journal d'audit), ou null si elle est acceptée. */
export type AnswerRewriteProblem =
  | 'empty'
  | 'too-long'
  | 'too-short'
  | 'numbers'
  | 'negation'
  | 'forbidden'
  | 'citation'
  | 'language'
  | 'new-words';

/**
 * Texte renvoyé par le modèle (`{"texte": "..."}`), paragraphes gardés et remis en forme ; null si la
 * réponse n'est pas le JSON attendu.
 */
export function parseAnswer(raw: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const text = (data as { texte?: unknown } | null)?.texte;
  return typeof text === 'string' ? tidyAnswer(text) : null;
}

/** Texte du modèle remis en forme : espaces simples, au plus une ligne vide entre deux paragraphes. */
export function tidyAnswer(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Même lecture que la recherche dans les fiches : minuscules, sans accents. */
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Mots d'au moins 6 lettres (les petits mots grammaticaux ne disent rien du contenu). */
const longWords = (text: string) => plain(text).match(/[a-z]{6,}/g) ?? [];

/**
 * Mots de liaison qu'une reformulation ajoute naturellement sans rien apporter : ils ne comptent pas comme
 * « nouveaux ».
 */
const LINKING_WORDS = new Set(
  [
    'aussi',
    'egalement',
    'cependant',
    'toutefois',
    'pourtant',
    'ensuite',
    'notamment',
    'concernant',
    'environ',
    'lorsque',
    'lorsqu',
    'quelques',
    'certains',
    'certaines',
    'plusieurs',
    'souvent',
    'generalement',
    'simplement',
    'surtout',
    'pendant',
    'depuis',
    'derniers',
    'dernieres',
    'periode',
    'mesures',
    'valeurs',
    'glycemie',
    'glycemies',
  ].map(plain),
);

/** Part des mots longs de la mise en mots qui n'ont aucune racine commune (5 lettres) avec le gabarit. */
export function newWordsRatio(source: string, rewritten: string): number {
  const roots = new Set(longWords(source).map((word) => word.slice(0, 5)));
  const words = longWords(rewritten).filter((word) => !LINKING_WORDS.has(word));
  if (words.length === 0) return 0;
  const fresh = words.filter((word) => !roots.has(word.slice(0, 5)));
  return fresh.length / words.length;
}

const FRENCH =
  /\b(?:le|la|les|de|des|du|un|une|et|est|vous|votre|vos|pour|dans|sur|que|qui|avec|au|aux|ce|cette|sont)\b/g;
const ENGLISH = /\b(?:the|and|your|you|is|are|of|with|this|that|for|when|blood|sugar)\b/g;

/** Vrai si le texte est en français (assez de petits mots français, presque aucun mot anglais). */
export function looksFrench(text: string): boolean {
  const lower = plain(text);
  const french = (lower.match(FRENCH) ?? []).length;
  const english = (lower.match(ENGLISH) ?? []).length;
  return french >= 3 && english <= 1;
}

/**
 * Nombres d'un texte, dans l'ordre (« 7,5 » et « 7.5 » sont le même nombre). Un chiffre collé APRÈS une
 * lettre fait partie d'un nom (« HbA1c ») : ce n'est pas un nombre.
 */
export function numbersIn(text: string): string[] {
  return (text.match(/(?<!\p{L})\d+(?:[.,]\d+)?/gu) ?? []).map((n) => n.replace(',', '.'));
}

/** Mots qui complètent un « ne » / « n' » : « ne … pas » est UNE négation. */
const NEGATION_PARTNERS = new Set([
  'pas',
  'plus',
  'jamais',
  'rien',
  'aucun',
  'aucune',
  'personne',
  'guere',
]);
/** Mots qui nient à eux seuls (« aucun signe », « pas encore », « sans sucre », « non allégé »). */
const NEGATION_WORDS = new Set(['pas', 'jamais', 'rien', 'aucun', 'aucune', 'sans', 'hors', 'non']);
/** Distance maximale (en mots) entre « ne » et son complément. */
const PARTNER_WINDOW = 6;

/**
 * Nombre de négations d'un texte : chaque « ne » / « n' » en est une (avec son « pas », « jamais »… qui
 * suit) ; chaque mot négatif seul (« aucun », « sans », « non », « pas » sans « ne ») aussi.
 */
export function negationCount(text: string): number {
  const words = plain(text)
    .replace(/\bn['’]/g, 'ne ')
    .split(/[^a-z]+/)
    .filter(Boolean);
  let count = 0;
  const used = new Set<number>();
  words.forEach((word, i) => {
    if (word === 'ne') {
      count += 1;
      for (let j = i + 1; j <= i + PARTNER_WINDOW && j < words.length; j++) {
        if (NEGATION_PARTNERS.has(words[j] as string) && !used.has(j)) {
          used.add(j);
          break;
        }
      }
    } else if (NEGATION_WORDS.has(word) && !used.has(i)) {
      count += 1;
    }
  });
  return count;
}

/**
 * Diagnostic, spéculation ou cause affirmée sur le patient (erreurs volontaires de L9-08 : « Vous êtes en hypoglycémie
 * chronique », « Vous avez probablement une insulinorésistance »), en plus des mots interdits de L3-05.
 * Appliqués au texte sans accents ; refusés seulement s'ils sont ABSENTS du gabarit.
 */
const DIAGNOSIS_CLAIMS: readonly string[] = [
  '\\bvous (?:etes|avez|souffrez|faites)\\b.{0,40}(?:hypo|hyper|diabet|insulino|resistan|malad|complication|neuropath|retinopath|infection)',
  'chroniq',
  'probabl',
  'sans doute',
  'certainement',
  'insulinoresist',
  'resistance a l insuline',
  'pre ?diabet',
  // Cause inventée (évaluation réelle de L9-08 : « la déshydratation peut entraîner une soif… »).
  'entrain(?:e|er|ent|ant)',
];

const FORBIDDEN = FORBIDDEN_PATTERNS.map((pattern) => new RegExp(pattern, 'i'));
const DIAGNOSIS = DIAGNOSIS_CLAIMS.map((pattern) => new RegExp(pattern));

/** Phrases d'un texte (coupées après « . », « ! », « ? », « ; » ou un retour à la ligne). */
const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/**
 * Vrai si UNE phrase de la mise en mots est presque entièrement nouvelle : une information ajoutée
 * (« Mangez une banane… ») que la moyenne sur tout le texte ne verrait pas.
 */
export function hasInventedSentence(source: string, rewritten: string): boolean {
  return sentencesOf(rewritten).some((sentence) => {
    const words = longWords(sentence).filter((word) => !LINKING_WORDS.has(word));
    return (
      words.length >= MIN_SENTENCE_WORDS &&
      newWordsRatio(source, sentence) > MAX_SENTENCE_NEW_WORDS_RATIO
    );
  });
}

/** Textes entre guillemets « … » d'une phrase. */
const quotesOf = (text: string) =>
  [...text.matchAll(/«\s*([^»]+?)\s*»/g)].map((match) => match[1] as string);

/** Mêmes nombres, autant de fois chacun (l'ordre peut changer avec la tournure). */
const sameNumbers = (a: readonly string[], b: readonly string[]) =>
  [...a].sort().join('|') === [...b].sort().join('|');

/** Vérifie la mise en mots du corps `source` ; null si elle peut remplacer le gabarit. */
export function checkAnswerRewrite(source: string, rewritten: string): AnswerRewriteProblem | null {
  if (rewritten.length === 0) return 'empty';
  const maxLength = Math.min(MAX_ANSWER_LENGTH, source.length * LENGTH_FACTOR + 120);
  if (rewritten.length > maxLength) return 'too-long';
  if (rewritten.length < source.length * MIN_LENGTH_RATIO) return 'too-short';
  if (!looksFrench(rewritten)) return 'language';
  if (!sameNumbers(numbersIn(source), numbersIn(rewritten))) return 'numbers';
  if (negationCount(source) !== negationCount(rewritten)) return 'negation';
  if (FORBIDDEN.some((pattern) => pattern.test(rewritten) && !pattern.test(source)))
    return 'forbidden';
  const [plainSource, plainRewritten] = [plain(source), plain(rewritten)];
  if (DIAGNOSIS.some((pattern) => pattern.test(plainRewritten) && !pattern.test(plainSource)))
    return 'forbidden';
  const sourceQuotes = quotesOf(source).map(plain);
  if (quotesOf(rewritten).some((quote) => !sourceQuotes.includes(plain(quote)))) return 'citation';
  if (/\bfiches?\b|\bsources?\b/i.test(rewritten) && !/\bfiches?\b|\bsources?\b/i.test(source))
    return 'citation';
  if (newWordsRatio(source, rewritten) > MAX_NEW_WORDS_RATIO) return 'new-words';
  if (hasInventedSentence(source, rewritten)) return 'new-words';
  return null;
}
