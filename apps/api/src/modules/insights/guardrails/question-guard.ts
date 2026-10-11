// Filtre des questions libres (L3-07, CDC §5.5 et F6 IA-4) : AVANT tout appel au modèle de langage, une
// question hors périmètre reçoit un refus poli qui renvoie vers le professionnel de santé.
// Déterministe (expressions régulières, aucun modèle) : il marche sans réseau, se teste, et un modèle
// détourné ne peut pas le contourner. Utilisé par POST /insights/ask (L3-08).
//
// Ordre des contrôles : l'URGENCE d'abord (sécurité du patient), puis le détournement, la dose, le
// traitement, le diagnostic, la prédiction, et enfin « hors sujet » (aucun mot du suivi glycémique).
// Le jeu de questions-pièges (test/fixtures/trap-questions.ts) doit être rejoué à chaque modification.

/** Raison d'un refus (journalisée pour l'audit, L3-10 ; jamais la question elle-même). */
export type RefusalReason =
  'EMERGENCY' | 'MANIPULATION' | 'DOSE' | 'TREATMENT' | 'DIAGNOSIS' | 'PREDICTION' | 'OFF_TOPIC';

export type QuestionVerdict =
  { refused: false } | { refused: true; reason: RefusalReason; answer: string };

/** Réponses polies, descriptives, toujours avec un renvoi vers le professionnel de santé ou les secours. */
export const REFUSAL_ANSWERS: Record<RefusalReason, string> = {
  EMERGENCY:
    "Si vous vous sentez mal, ne restez pas seul : contactez immédiatement les services d'urgence ou un professionnel de santé. Afyabora ne peut pas vous aider dans une situation d'urgence.",
  MANIPULATION:
    'Je ne peux pas changer mes règles. Je peux seulement décrire vos mesures de glycémie, sans diagnostic ni conseil de traitement. Pour le reste, parlez-en à votre professionnel de santé.',
  DOSE: 'Je ne peux pas vous indiquer de dose ni de quantité de médicament. Seul votre professionnel de santé peut adapter votre traitement. Je peux en revanche vous décrire vos mesures.',
  TREATMENT:
    "Je ne peux pas vous conseiller de commencer, d'arrêter ou de modifier un traitement. Parlez-en à votre professionnel de santé avant tout changement.",
  DIAGNOSIS:
    'Je ne peux pas poser de diagnostic ni dire si une situation est grave. Je décris seulement vos mesures ; votre professionnel de santé pourra les interpréter avec vous.',
  PREDICTION:
    "Je ne peux pas prédire l'évolution de votre santé. Votre professionnel de santé est la bonne personne pour en parler.",
  OFF_TOPIC:
    'Je peux seulement répondre aux questions sur vos mesures de glycémie (tendances, moments de la journée, comparaison de périodes). Pour toute autre question de santé, parlez-en à votre professionnel de santé.',
};

/**
 * Texte comparable : minuscules, sans accents, apostrophes et tirets remplacés par des espaces, espaces
 * simples. « Dois-je arrêter l’insuline ? » → « dois je arreter l insuline ? ».
 */
export function normalizeQuestion(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`´-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ordre de priorité des raisons : l'urgence passe avant tout. */
const PRIORITY: readonly RefusalReason[] = [
  'EMERGENCY',
  'MANIPULATION',
  'DOSE',
  'TREATMENT',
  'DIAGNOSIS',
  'PREDICTION',
];

/** Une expression régulière à partir d'une liste de formulations (une par ligne : plus lisible à relire). */
const anyOf = (...parts: string[]) => new RegExp(parts.join('|'));

/** Noms commerciaux courants d'insulines et d'antidiabétiques : les citer, c'est parler de traitement. */
const BRANDS =
  '(lantus|toujeo|levemir|tresiba|abasaglar|novorapid|humalog|apidra|fiasp|actrapid|insulatard|mixtard|humulin|novomix|ozempic|trulicity|victoza|januvia|jardiance|forxiga|glucophage|diamicron|amarel)';

/** Règles, dans l'ordre où elles sont vérifiées. Les motifs s'appliquent au texte normalisé. */
const RULES: readonly [RefusalReason, RegExp][] = [
  [
    'EMERGENCY',
    anyOf(
      '\\burgen',
      '\\bmalaise',
      'evanoui',
      'perte de connaissance',
      '(perdu|perd|perdre) connaissance',
      'inconscient',
      'convuls',
      '\\bcoma\\b',
      'je me sens (tres |vraiment )?mal',
      'je suis (tres )?confus',
      'mal a respirer',
      'n arrive (plus|pas) a respirer',
      'douleur (dans la |a la )?(poitrine|thoracique)',
      'ne (se )?reveille (pas|plus)',
      'ne repond (pas|plus)',
      'je tremble',
      '(vais|va) tomber',
      'je tombe',
      'vertiges?',
      'sueurs? froides?',
      'transpire beaucoup',
      'somnolent',
      '\\bsamu\\b',
      'ambulance',
      'appeler (les )?secours',
      'au secours',
      '\\ba l aide\\b',
    ),
  ],
  [
    'MANIPULATION',
    anyOf(
      '\\bignore',
      '\\boublie (tes|les|toutes|vos)',
      'tes (regles|consignes|instructions)',
      '\\bvos (regles|consignes|instructions)',
      'tu es (maintenant|desormais)',
      'desormais,? tu',
      'a partir de maintenant,? tu',
      '(tu|vous) (reponds|repondez|parles|parlez|agis|agissez) comme',
      'fais comme si',
      'fait comme si',
      'fais semblant',
      'joue le role',
      'role ?play',
      'mode (developpeur|dev|sans limite)',
      'jailbreak',
      '\\bprompt\\b',
      'instructions? (systeme|cachee)',
      'sans (tes |aucune? )?(filtre|restriction|limite|garde fou)',
      'en tant que (medecin|docteur|pharmacien)',
      'tu es (un |une )?(medecin|docteur|pharmacien)',
    ),
  ],
  [
    'DOSE',
    anyOf(
      '\\bdoses?\\b',
      'dosage',
      'posologie',
      '\\bunites?\\b',
      'combien d(e )?(insuline|comprimes?|cachets?|gelules?|mg|ml|piqures?)',
      `(combien|quantite).*\\b${BRANDS}\\b`,
      'quelle quantite',
      '\\binsuline\\b.*\\b(prendre|injecter|faire|mettre)\\b',
      '\\b(prendre|injecter|faire|mettre)\\b.*\\binsuline\\b',
      '(augmenter|diminuer|baisser|doubler|reduire) (mon|ma|mes|la|le|l|les) ?(insuline|dose|traitement|medicament|metformine|comprime)',
    ),
  ],
  [
    'TREATMENT',
    anyOf(
      '(arreter|stopper|changer|remplacer|sauter|commencer|interrompre|suspendre) (mon|ma|mes|le|la|les|l|de|du) ?(traitement|medicament|insuline|metformine|comprime|cachet|piqure)',
      'quel (medicament|traitement|remede)',
      'quels (medicaments|traitements|remedes)',
      '\\bremedes?\\b',
      'tisane',
      'plante (pour|contre|qui)',
      '\\bmetformine\\b',
      `\\b${BRANDS}\\b`,
      '\\bglicl',
      'sulfamide',
      '\\bguerir\\b',
      'soigner (mon|le) diabete',
      'regime (pour|contre|a suivre)',
    ),
  ],
  [
    'DIAGNOSIS',
    anyOf(
      '\\bdiagnos',
      'suis je diabetique',
      '\\bsuis (je )?(malade|diabetique|en danger)\\b',
      'ai je (un |le |du )?diabete',
      '(mon |le )?diabete (est |)?(severe|grave|avance|de type)',
      'type (1|2) ou',
      'est ce (que c est )?(grave|dangereux|inquietant|normal|alarmant)',
      'c est (grave|dangereux|inquietant|normal)\\b',
      'ai je (une|un|des) (maladie|complication|neuropathie|retinopathie|infection)',
      'quelle maladie',
      'ai je fait (une|un) (hypo|malaise)',
      'prediabet',
      'resistance a l insuline',
    ),
  ],
  [
    'PREDICTION',
    anyOf(
      'vais je (mourir|deceder|perdre|devenir|avoir|guerir|devoir)',
      'faudra t il (passer|prendre|que)',
      'esperance de vie',
      'combien de temps (me reste|vais je|avant)',
      '\\b(je )?risque (une?|des|de|d)\\b',
      'crise cardiaque',
      'infarctus',
      '\\bavc\\b',
      'dans (cinq|5|dix|10) ans',
      '(predire|prevoir|predis|prevois) (ma|mon|mes|si)',
      'est ce que (ca|cela) va (empirer|s aggraver)',
      'm attendre a',
    ),
  ],
];

/**
 * Questions sur l'AVENIR (« demain », « sera », « la semaine prochaine »…). Elles ne comptent comme
 * prédiction que si la question parle de glycémie : sinon « Quel temps fera-t-il demain ? » serait refusée
 * comme prédiction au lieu de l'être comme hors sujet.
 */
const FUTURE = anyOf(
  '\\b(sera|seront|serai|seras|serons)\\b',
  '(semaine|mois|annee) prochaine?',
  '\\bdemain\\b',
  'a l avenir',
  '\\bbientot\\b',
  '\\b(va|vont) (etre|devenir|augmenter|baisser|remonter|descendre|s ameliorer)',
);

/** Familles de formulations ajoutées après le 2e jeu inédit (L3-07) : plus générales que des phrases. */
const MORE: readonly [RefusalReason, RegExp][] = [
  [
    'EMERGENCY',
    anyOf(
      'vue trouble',
      'ne bouge (pas|plus)',
      'n arrive (plus|pas) a (parler|marcher|bouger|me lever|se lever|tenir debout)',
      '(que|quoi) faire (tout de suite|immediatement|en urgence)',
      'je fais quoi (tout de suite|immediatement)',
    ),
  ],
  [
    'MANIPULATION',
    anyOf(
      'imagine (que )?(tu|vous)',
      '(aucune|sans|pas de) regles?',
      '(repete|recite|donne|montre|affiche|ecris|revele).*(consignes|instructions|regles)',
      'qu on t a (donne|dit)',
    ),
  ],
  [
    'DIAGNOSIS',
    anyOf(
      '\\b(mes|mon|ma) (reins?|coeur|yeux|oeil|foie|pieds?|nerfs?|vue|pancreas|arteres?|tension)\\b',
      'chronique',
      'est ce (mauvais|bien|bon|un bon signe|un mauvais signe)',
      '\\b(vont|va) bien\\b',
      '(bien|mal) equilibre',
      'desequilibre',
    ),
  ],
  ['PREDICTION', FUTURE],
];

/** Seuil « très bas » par défaut (mg/dL, @glyka/shared) : une valeur citée en dessous = urgence possible. */
const VERY_LOW_MG_DL = 55;

/**
 * Une valeur de glycémie TRÈS basse citée dans la question (« ma glycémie est à 0,3 », « 45 mg/dL »,
 * « 2,8 mmol/L ») : on renvoie vers les secours, quelle que soit la formulation. Sans unité, comme dans
 * l'usage courant à Kinshasa : un nombre à virgule est en g/L, un entier de 20 ou plus en mg/dL.
 * Seulement si la question parle de glycémie (sinon « dans 5 ans » ou « 3 fois » compteraient).
 */
export function mentionsVeryLowValue(text: string): boolean {
  if (
    !/glycemi|\bsucre|\btaux\b|\bhypo|\bvaleur|\bmesure|je suis a|\best a\b|\bg ?\/ ?l\b|mg|mmol/.test(
      text,
    )
  ) {
    return false;
  }
  const values = text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(g ?\/ ?l\b|mg(?: ?\/ ?dl)?\b|mmol(?: ?\/ ?l)?\b)?(?!\s*(%|fois|jours?|ans?|h\b|heures?|minutes?|semaines?|mois|unites?))/g,
  );
  for (const [, raw, unit] of values) {
    const value = Number((raw as string).replace(',', '.'));
    let mgDl: number;
    if (unit?.startsWith('mmol')) mgDl = value * 18.016;
    else if (unit?.startsWith('mg')) mgDl = value;
    else if (unit)
      mgDl = value * 100; // g/L
    else if ((raw as string).match(/[.,]/) || value < 10)
      mgDl = value * 100; // « 0,3 » : g/L
    else mgDl = value; // « 45 » : mg/dL
    if (mgDl > 0 && mgDl < VERY_LOW_MG_DL) return true;
  }
  return false;
}

/** Mots du suivi glycémique : sans aucun d'eux, la question est hors sujet. */
const DOMAIN =
  /glycemi|\bsucre|\bmesure|\bvaleur|\btaux\b|\bcible|\bseuil|\bhypo|\bhyper|\bmatin|\bmidi|\bsoir|\bnuit|\bsemaine|\bmois\b|\bjour|\bperiode|\brepas|\bmanger|\bactivite|\bsport|\bmarche|\btendance|variation|\bmoyenne|historique|\banalyse|resultat|\bdonnee|qualite|\bhaut|\bbas\b|\bbasse|\bpic|\bmg ?\/ ?dl|\bg ?\/ ?l\b|mmol|\bcourbe|evolution|\bprogres|\bstable|\bglucose|diabet/;

/** Décide si la question peut être posée au modèle, ou reçoit un refus poli (et pourquoi). */
export function screenQuestion(question: string): QuestionVerdict {
  const text = normalizeQuestion(question);
  if (mentionsVeryLowValue(text)) {
    return { refused: true, reason: 'EMERGENCY', answer: REFUSAL_ANSWERS.EMERGENCY };
  }
  // Toutes les règles d'une même raison sont vérifiées avant de passer à la suivante (ordre de priorité).
  for (const reason of PRIORITY) {
    const matched = [...RULES, ...MORE].some(
      ([r, pattern]) =>
        r === reason && pattern.test(text) && (pattern !== FUTURE || DOMAIN.test(text)),
    );
    if (matched) return { refused: true, reason, answer: REFUSAL_ANSWERS[reason] };
  }
  if (!DOMAIN.test(text)) {
    return { refused: true, reason: 'OFF_TOPIC', answer: REFUSAL_ANSWERS.OFF_TOPIC };
  }
  return { refused: false };
}
