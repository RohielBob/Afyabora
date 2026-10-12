// Questions GÉNÉRALES (L9-06) : recherche dans les fiches de connaissances (L9-02) par mots-clés, puis
// réponse = extrait de la fiche, CITÉE. Rien d'autre que le texte de la fiche : jamais d'invention.
// Recherche simple et explicable (pas de modèle, pas de dépendance) : chaque mot-clé de la fiche trouvé
// dans la question rapporte autant de points qu'il a de mots ; la fiche la mieux notée l'emporte.
import type { KnowledgeSheetRef } from '@glyka/shared';
import { normalizeQuestion } from '../../insights/guardrails/question-guard';
import type { ParsedSheet } from '../knowledge/sheet-format';

/** Mots trop courants pour départager deux fiches. */
const STOP = new Set(
  'a au aux avec ce ces c cest de des du en est et il je j la le les ma mes mon ne on ou par pas pour que qu quoi qui sa se si son sur un une vous votre vos y d l comment quand quel quelle quels quelles faire fait'.split(
    ' ',
  ),
);

/** Mots significatifs d'un texte normalisé. */
function words(normalized: string): string[] {
  return normalized
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Deux mots « se ressemblent » : identiques, ou même début (hypoglycemie / hypoglycemies, basse / bas). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 3;
}

/** Mots du domaine présents dans presque toutes les questions : seuls, ils ne désignent aucune fiche. */
const GENERIC = ['glycemie', 'diabete', 'diabetique', 'sucre', 'mesure', 'sang', 'taux'];
const GENERIC_WEIGHT = 0.25;

/**
 * Poids d'un mot :
 *  - mot générique (« glycémie », « diabète »…) : ¼ ;
 *  - sinon 1 s'il est mot-clé À PART ENTIÈRE d'une seule fiche (ou d'aucune), ½ de deux fiches, ⅓ de trois…
 *    (« hypoglycémie » dans « hypoglycémie à l'effort » ne compte pas : c'est la fiche hypoglycémie qui l'a
 *    comme mot-clé seul.)
 * Il faut donc au moins un mot propre à une fiche pour la citer (MIN_SHEET_SCORE).
 */
function wordWeights(sheets: readonly ParsedSheet[]): (word: string) => number {
  const single = sheets.map((s) =>
    s.keywords
      .map((k) => words(normalizeQuestion(k)))
      .filter((kw) => kw.length === 1)
      .flat(),
  );
  return (word) => {
    if (GENERIC.some((g) => sameWord(g, word))) return GENERIC_WEIGHT;
    return 1 / Math.max(1, single.filter((kw) => kw.some((k) => sameWord(k, word))).length);
  };
}

/**
 * Score d'une fiche : pour chaque mot-clé dont TOUS les mots figurent dans la question, la somme des poids
 * de ses mots. `weight` : poids des mots (par défaut 1 pour chacun).
 */
export function sheetScore(
  sheet: ParsedSheet,
  question: string,
  weight: (word: string) => number = () => 1,
): number {
  const asked = words(normalizeQuestion(question));
  let score = 0;
  for (const keyword of sheet.keywords) {
    const kw = words(normalizeQuestion(keyword));
    if (kw.length > 0 && kw.every((k) => asked.some((w) => sameWord(k, w)))) {
      score += kw.reduce((sum, k) => sum + weight(k), 0);
    }
  }
  return score;
}

/** Score minimal pour citer une fiche : au moins l'équivalent d'un mot propre à cette fiche. */
export const MIN_SHEET_SCORE = 1;

/** Fiche la plus pertinente, ou null si aucune n'atteint MIN_SHEET_SCORE. Égalité : l'ordre des fiches. */
export function bestSheet(sheets: readonly ParsedSheet[], question: string): ParsedSheet | null {
  const weight = wordWeights(sheets);
  let best: ParsedSheet | null = null;
  let bestScore = MIN_SHEET_SCORE - Number.EPSILON;
  for (const sheet of sheets) {
    const score = sheetScore(sheet, question, weight);
    if (score > bestScore) {
      best = sheet;
      bestScore = score;
    }
  }
  return best;
}

/** Longueur maximale de l'extrait (la fiche entière reste lisible dans l'application). */
export const EXCERPT_MAX = 700;

/**
 * Intention de la question ⇒ titre de partie qui y répond (« Que faire ? » ⇒ « Les gestes… »).
 * Explicable et vérifiable : une liste fixe, testée sur les vraies fiches.
 */
const INTENTS: readonly [RegExp, RegExp][] = [
  [
    /\b(que faire|quoi faire|comment (reagir|faire|agir)|gestes?|reagir)\b/,
    /\b(faire|gestes?|reagir|precautions|aider|aide)\b/,
  ],
  [/\b(signes?|symptomes?|reconnaitre|sentir|ressen\w*)\b/, /\b(signes?|symptomes?)\b/],
  [
    /\b(c est quoi|qu est ce|definition|signifi\w*|que veut dire)\b/,
    /\b(quoi|qu est ce|parle t on)\b/,
  ],
  [/\b(combien|frequence|souvent|objectif|cible)\b/, /\b(combien|frequence|objectif|cible)\b/],
  [/\b(quand|urgence|secours|appeler)\b/, /\b(quand|secours|appeler|urgence|prevenir)\b/],
];

/** Partie de la fiche (« ## … ») la plus proche de la question, en texte simple. */
function bestSection(body: string, question: string): string {
  const normalized = normalizeQuestion(question);
  const asked = words(normalized);
  const sections = body.split(/\n(?=## )/).map((s) => s.trim());
  let best = sections[0] ?? body;
  let bestScore = -1;
  for (const section of sections) {
    const heading = normalizeQuestion(section.split('\n')[0] ?? '');
    const text = words(normalizeQuestion(section));
    // Mots de la question retrouvés dans la partie, + 3 si son titre répond à l'intention de la question.
    const intent = INTENTS.some(([ask, title]) => ask.test(normalized) && title.test(heading))
      ? 3
      : 0;
    const score = asked.filter((w) => text.some((t) => sameWord(w, t))).length + intent;
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  // Markdown simple → texte : titre suivi de « : », listes en phrases, gras retiré.
  return (
    best
      // « Les signes possibles » → « Les signes possibles : » ; « Qu'est-ce que l'HbA1c ? » reste tel quel.
      .replace(/^## (.+)$/m, (_line, heading: string) =>
        /[?!:]$/.test(heading) ? heading : `${heading} :`,
      )
      .replace(/\*\*/g, '')
      .replace(/^- /gm, '• ')
      .replace(/\n{2,}/g, '\n')
      .trim()
  );
}

/** Coupe un texte à `max` caractères, à la fin d'une phrase ou d'une ligne si possible. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf(' ;'));
  return `${(end > max / 2 ? slice.slice(0, end + 1) : slice).trimEnd()} …`;
}

/** Rappel ajouté à toute réponse tirée d'une fiche. */
export const SHEET_REMINDER =
  'Pour une décision qui vous concerne, parlez-en à votre professionnel de santé. La fiche complète est disponible dans l’application.';

export interface SheetAnswer {
  text: string;
  source: KnowledgeSheetRef;
}

/** Réponse tirée de la fiche : titre et résumé, la partie la plus pertinente, le rappel. */
export function sheetAnswer(parsed: ParsedSheet, question: string): SheetAnswer {
  const { sheet } = parsed;
  const text = [
    `D'après la fiche « ${sheet.title} » : ${sheet.summary}`,
    cut(bestSection(sheet.body, question), EXCERPT_MAX),
    SHEET_REMINDER,
  ].join('\n\n');
  return { text, source: { id: sheet.id, title: sheet.title, status: sheet.status } };
}
