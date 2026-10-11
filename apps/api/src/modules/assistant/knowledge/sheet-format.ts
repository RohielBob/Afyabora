// Format et règles des fiches de connaissances de l'assistant « Afyabora » (L9-02, ADR-0005 complétée le
// 2026-10-11). Une fiche est un fichier Markdown de `apps/api/knowledge/fiches/` : un en-tête (entre deux
// lignes « --- ») puis le texte. Procédure de rédaction et de relecture : `apps/api/knowledge/README.md`.
//
// Ce module est PUR (aucune lecture de fichier) : il transforme le texte d'une fiche en données vérifiées, ou
// refuse la fiche avec un message clair. Une fiche refusée n'est jamais servie au patient.
import { createHash } from 'node:crypto';
import {
  knowledgeSheetSchema,
  type KnowledgeSheet,
  type KnowledgeSheetStatus,
} from '@glyka/shared';
import { BRANDS, normalizeQuestion } from '../../insights/guardrails/question-guard';

/** Une fiche lue et vérifiée. */
export interface ParsedSheet {
  /** Données renvoyées par GET /assistant/sheets/{sheetId} (schéma KnowledgeSheet du contrat 0.4.0). */
  sheet: KnowledgeSheet;
  /** Mots-clés (minuscules) qui aideront à retrouver la fiche (recherche de L9-06). */
  keywords: string[];
  /** Empreinte du contenu relu (voir sheetDigest). */
  digest: string;
}

/** Fiche refusée : le message dit quel fichier et pourquoi. */
export class SheetFormatError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`Fiche ${file} refusée :\n- ${problems.join('\n- ')}`);
    this.name = 'SheetFormatError';
  }
}

/** Champs de l'en-tête, tous obligatoires (même vides) pour que chaque fiche suive le même modèle. */
const KEYS = [
  'id',
  'titre',
  'resume',
  'statut',
  'version',
  'relu_par',
  'relu_le',
  'empreinte',
  'mots_cles',
  'sources',
] as const;
type Key = (typeof KEYS)[number];

/** Statut écrit dans la fiche (français, pour le médecin) → statut du contrat. */
const STATUSES: Record<string, KnowledgeSheetStatus> = {
  brouillon: 'DRAFT',
  validee: 'VALIDATED',
};

/** Taille du texte d'une fiche : assez pour être utile, assez court pour tenir dans la consigne du modèle. */
export const SHEET_BODY_MIN = 600;
export const SHEET_BODY_MAX = 4000;

/**
 * Empreinte du contenu relu par le médecin : titre, résumé, sources et texte (pas les mots-clés, purement
 * techniques). Une fiche validée garde l'empreinte de ce qui a été relu : si le contenu change ensuite, les
 * empreintes ne correspondent plus et la fiche est refusée tant qu'elle n'est pas relue de nouveau.
 */
export function sheetDigest(content: {
  title: string;
  summary: string;
  sources: { label: string; url: string }[];
  body: string;
}): string {
  const text = [
    content.title,
    content.summary,
    ...content.sources.map((s) => `${s.label} | ${s.url}`),
    content.body,
  ].join('\n');
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Règles de contenu : ce qu'une fiche ne doit JAMAIS contenir (ADR-0005). Appliquées au texte normalisé
 * (minuscules, sans accents, apostrophes remplacées par des espaces), comme le filtre des questions (L3-07).
 */
const CONTENT_RULES: readonly [string, RegExp][] = [
  ['nom commercial de médicament', new RegExp(`\\b${BRANDS}\\b`)],
  [
    'dose de médicament',
    /\d+(?:[.,]\d+)?\s*(?:unites?|ui|u)\b|\d+(?:[.,]\d+)?\s*(?:mg|mcg|ml)\b(?!\s*\/\s*dl)|posologie/,
  ],
  [
    'consigne de modifier un traitement',
    /\b(?:augment|diminu|baiss|doubl|redui|arret|stopp|saut|inject)\w*\s+(?:votre|vos|la|le|les|l|une?|de|d|son|sa|ses)\s+(?:insuline|traitement|medicament|comprime|dose|piqure)s?\b/,
  ],
  [
    "numéro de téléphone (le numéro d'urgence vient du profil du patient)",
    /\b(?:appel\w*|compos\w*)\s+(?:le\s+)?\+?\d/,
  ],
  [
    'promesse de guérison',
    /guerir (?:le |du |votre )?diabete|guerison du diabete|miracle|remede naturel/,
  ],
  [
    'diagnostic affirmé',
    /\bvous (?:avez|souffrez(?: de| d)?) (?:un |une |le |la |l )?(?:diabete|apnee|depression|acidocetose)/,
  ],
];

/** Problèmes de contenu d'un texte de fiche (liste vide = rien à redire). */
export function contentProblems(body: string): string[] {
  const problems: string[] = [];
  const lines = body.split('\n');

  // Markdown simple, que le téléphone sait afficher : titres « ## », paragraphes, listes « - », **gras**.
  lines.forEach((line, i) => {
    if (/^#/.test(line) && !/^## \S/.test(line)) {
      problems.push(`ligne ${i + 1} : seuls les titres « ## » sont permis`);
    }
    if (/^\s*(?:\||>|<|```|!\[|\*\s|\d+\.\s)/.test(line)) {
      problems.push(
        `ligne ${i + 1} : mise en forme non permise (tableau, citation, HTML, code, image, liste numérotée ou « * »)`,
      );
    }
  });
  if (/\]\(|https?:|www\./i.test(body)) {
    problems.push('aucun lien dans le texte : les adresses vont dans « sources »');
  }
  if (lines.filter((l) => l.startsWith('## ')).length < 2) {
    problems.push('au moins deux parties « ## »');
  }
  if (body.length < SHEET_BODY_MIN || body.length > SHEET_BODY_MAX) {
    problems.push(
      `texte de ${body.length} caractères (attendu : ${SHEET_BODY_MIN} à ${SHEET_BODY_MAX})`,
    );
  }
  if (!/m[ée]decin|professionnel de sant[ée]/i.test(body)) {
    problems.push('rappel absent : la fiche doit renvoyer au médecin ou au professionnel de santé');
  }

  const normalized = normalizeQuestion(body);
  for (const [name, pattern] of CONTENT_RULES) {
    const found = normalized.match(pattern);
    if (found) problems.push(`interdit : ${name} (« ${found[0]} »)`);
  }
  return problems;
}

/** Sépare l'en-tête et le texte ; lit l'en-tête ligne par ligne (format volontairement simple et strict). */
function readFrontMatter(text: string, problems: string[]) {
  const values = new Map<Key, string>();
  const sources: string[] = [];
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) {
    problems.push(
      'en-tête absent : la fiche doit commencer par « --- » et l’en-tête finir par « --- »',
    );
    return { values, sources, body: '' };
  }

  let inSources = false;
  for (const line of match[1]!.split('\n')) {
    if (line.trim() === '') continue;
    const item = /^ {2}- (.+)$/.exec(line);
    if (item) {
      if (inSources) sources.push(item[1]!.trim());
      else problems.push(`ligne d'en-tête inattendue : « ${line} »`);
      continue;
    }
    const field = /^([a-z_]+):(?: (.*))?$/.exec(line);
    if (!field) {
      problems.push(`ligne d'en-tête incompréhensible : « ${line} »`);
      continue;
    }
    const key = field[1] as Key;
    if (!KEYS.includes(key)) {
      problems.push(`champ inconnu : « ${field[1]} »`);
      continue;
    }
    if (values.has(key)) problems.push(`champ en double : « ${key} »`);
    values.set(key, (field[2] ?? '').trim());
    inSources = key === 'sources';
    if (inSources && values.get('sources') !== '') {
      problems.push('« sources » : une source par ligne, sous la forme « - Libellé | adresse »');
    }
  }
  for (const key of KEYS) {
    if (!values.has(key)) problems.push(`champ manquant : « ${key} »`);
  }
  return { values, sources, body: match[2]!.trim() };
}

/**
 * Lit une fiche. `fileName` : nom du fichier (« hypoglycemie.md ») ; l'identifiant doit être le même.
 * Lève SheetFormatError avec TOUS les problèmes trouvés, pour tout corriger en une fois.
 */
export function parseSheet(text: string, fileName: string): ParsedSheet {
  const problems: string[] = [];
  const { values, sources: rawSources, body } = readFrontMatter(text, problems);
  const get = (key: Key) => values.get(key) ?? '';

  const id = get('id');
  if (fileName !== `${id}.md`) {
    problems.push(`l'identifiant « ${id} » doit être le nom du fichier sans « .md »`);
  }

  const status = STATUSES[get('statut')];
  if (!status) problems.push('« statut » : « brouillon » ou « validee »');

  const version = Number(get('version'));
  if (!/^[1-9]\d*$/.test(get('version'))) {
    problems.push('« version » : un nombre entier à partir de 1');
  }

  const sources = rawSources.map((raw) => {
    const cut = raw.lastIndexOf(' | ');
    if (cut < 0) problems.push(`source sans « | » : « ${raw} »`);
    const url = cut < 0 ? '' : raw.slice(cut + 3).trim();
    if (cut >= 0 && !url.startsWith('https://')) {
      problems.push(`source sans adresse https : « ${raw} »`);
    }
    return { label: cut < 0 ? raw : raw.slice(0, cut).trim(), url };
  });
  if (sources.length === 0) problems.push('au moins une source publique');

  const keywords = get('mots_cles')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k !== '');
  if (keywords.length < 5)
    problems.push('« mots_cles » : au moins 5 mots-clés séparés par des virgules');

  const title = get('titre');
  const summary = get('resume');
  const digest = sheetDigest({ title, summary, sources, body });

  // Brouillon : aucune trace de relecture. Validée : relecteur, date ET empreinte de ce qui a été relu.
  const reviewedBy = get('relu_par');
  const reviewedOn = get('relu_le');
  const recorded = get('empreinte');
  if (status === 'DRAFT' && (reviewedBy || reviewedOn || recorded)) {
    problems.push('un brouillon laisse « relu_par », « relu_le » et « empreinte » vides');
  }
  if (status === 'VALIDATED') {
    if (!reviewedBy || !reviewedOn) {
      problems.push(
        'une fiche validée indique « relu_par » (le médecin) et « relu_le » (AAAA-MM-JJ)',
      );
    }
    if (!recorded) {
      // Étape normale de la validation (README) : le médecin vient de relire, l'empreinte reste à recopier.
      problems.push(
        `empreinte à recopier après la relecture : « empreinte: ${digest} » (empreinte actuelle : « ${digest} »)`,
      );
    } else if (recorded !== digest) {
      problems.push(
        `le contenu a changé depuis la relecture (empreinte relue : « ${recorded} », empreinte actuelle : « ${digest} ») : repasser la fiche en brouillon, augmenter sa version et la faire relire`,
      );
    }
  }

  problems.push(...contentProblems(body));

  const sheet = {
    id,
    title,
    summary,
    status: status ?? 'DRAFT',
    version,
    reviewedOn: status === 'VALIDATED' ? reviewedOn : null,
    body,
    sources,
    reviewedBy: status === 'VALIDATED' ? reviewedBy : null,
  };
  const checked = knowledgeSheetSchema.safeParse(sheet);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      problems.push(`${issue.path.join('.') || 'fiche'} : ${issue.message}`);
    }
  }

  if (problems.length > 0) throw new SheetFormatError(fileName, problems);
  return { sheet: checked.data!, keywords, digest };
}
