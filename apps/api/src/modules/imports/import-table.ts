// Tableau d'import commun au CSV (L4-01) et à l'Excel (L4-02) : une fois le fichier découpé en lignes de
// cellules (texte), la suite est la même pour les deux formats.
//  - COLONNES : date, heure, valeur, unité, contexte reconnues d'après l'en-tête (avec ou sans accents ni
//    majuscules) ; la correspondance donnée par le patient passe avant.
//  - NOMBRES : « 0,92 » et « 0.92 » ⇒ 0.92 ; « 1 870 » ⇒ 1870 ; le reste ⇒ null (« illisible »).
//  - ERREURS claires sur le FICHIER entier (`ImportFileError`), jamais sur une ligne.
//
// Ce que ce fichier ne fait PAS (L4-03) : lire les dates, convertir les unités, décider VALID / DUPLICATE /
// INCONSISTENT / ERROR. Une ligne bizarre est rendue telle quelle, avec son numéro, pour le rapport.
import { IMPORT_MAX_ROWS, type importColumnMappingSchema } from '@glyka/shared';
import type { z } from 'zod';

export type ImportColumn = 'date' | 'time' | 'value' | 'unit' | 'context';
/** Correspondance donnée par le patient : nom de colonne de l'en-tête pour chaque rôle. */
export type ImportMapping = z.infer<typeof importColumnMappingSchema>;
/** Correspondance retenue : numéro de colonne (0 = première) pour chaque rôle trouvé. */
export type ResolvedMapping = { date: number; value: number } & Partial<
  Record<'time' | 'unit' | 'context', number>
>;

/** Une ligne du fichier découpée en cellules (texte), avec son numéro dans le fichier. */
export interface ImportRecord {
  line: number;
  fields: string[];
}

/** Une ligne de données, textes nettoyés des espaces autour. Rien n'est encore validé. */
export interface ImportRow {
  /** Numéro de ligne dans le fichier (en-tête = 1 dans un CSV ; numéro de ligne Excel dans un classeur). */
  line: number;
  date: string;
  time?: string;
  /** Valeur telle qu'écrite (montrée au patient dans le rapport). */
  rawValue: string;
  /** Valeur lue (virgule ou point décimal), ou null si illisible. */
  value: number | null;
  unit?: string;
  context?: string;
  /** Vrai si la ligne n'a pas autant de colonnes que l'en-tête (ligne abîmée, à vérifier). */
  columnMismatch: boolean;
}

/** En-têtes, colonnes retenues et lignes : ce que rendent les deux lecteurs (CSV et Excel). */
export interface ImportTable {
  headers: string[];
  mapping: ResolvedMapping;
  rows: ImportRow[];
}

export type ImportErrorCode =
  | 'EMPTY' // aucun contenu, ou seulement un en-tête
  | 'TOO_LARGE' // plus de IMPORT_MAX_FILE_BYTES (ou classeur qui se décompresse en trop gros)
  | 'TOO_MANY_ROWS' // plus de IMPORT_MAX_ROWS lignes de données
  | 'NOT_TABULAR' // une seule colonne : ce n'est pas un tableau lisible
  | 'UNKNOWN_COLUMN' // la correspondance donnée cite une colonne absente de l'en-tête
  | 'MISSING_COLUMNS' // date ou valeur introuvable : le patient doit indiquer les colonnes
  | 'CORRUPTED' // classeur Excel illisible (abîmé, ou pas un classeur)
  | 'UNSUPPORTED_FORMAT'; // ancien format Excel (.xls) ou classeur protégé par mot de passe

/**
 * Erreur claire sur le FICHIER entier (jamais sur une ligne). `headers` est rempli quand l'en-tête a été
 * lu, pour que l'appli propose de choisir les colonnes (L4-06).
 */
export class ImportFileError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly headers: string[] = [],
  ) {
    super(message);
    this.name = 'ImportFileError';
  }
}

/** En-tête comparable : sans accents, minuscules, ponctuation ⇒ espace (« Glycémie (g/L) » ⇒ « glycemie g l »). */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Noms d'en-tête reconnus pour chaque rôle (déjà normalisés). Ordre des rôles = ordre de recherche. */
export const HEADER_SYNONYMS: Readonly<Record<ImportColumn, readonly string[]>> = {
  date: [
    'date',
    'jour',
    'day',
    'date mesure',
    'date de mesure',
    'date et heure',
    'date heure',
    'datetime',
    'horodatage',
    'timestamp',
  ],
  time: ['heure', 'time', 'hour', 'horaire', 'heure de mesure'],
  value: [
    'glycemie',
    'glycemia',
    'glucose',
    'valeur',
    'value',
    'mesure',
    'taux',
    'resultat',
    'result',
    'reading',
    'bg',
    'blood glucose',
  ],
  unit: ['unite', 'unites', 'unit', 'units'],
  context: [
    'contexte',
    'context',
    'moment',
    'repas',
    'meal',
    'note',
    'notes',
    'commentaire',
    'commentaires',
    'comment',
    'tag',
  ],
};

const ROLES = Object.keys(HEADER_SYNONYMS) as ImportColumn[];

/**
 * Reconnaît les colonnes d'après l'en-tête. 1er passage : nom exact (« Glycémie » ⇒ valeur) ; 2e passage :
 * nom qui CONTIENT un mot reconnu (« Glycémie (g/L) », « Date du relevé »). Une colonne ne sert qu'une fois.
 */
export function detectMapping(headers: readonly string[]): Partial<Record<ImportColumn, number>> {
  const names = headers.map(normalizeHeader);
  const found: Partial<Record<ImportColumn, number>> = {};
  const used = new Set<number>();
  const pass = (matches: (name: string, synonym: string) => boolean) => {
    for (const role of ROLES) {
      if (found[role] !== undefined) continue;
      const index = names.findIndex(
        (name, i) => !used.has(i) && HEADER_SYNONYMS[role].some((s) => matches(name, s)),
      );
      if (index >= 0) {
        found[role] = index;
        used.add(index);
      }
    }
  };
  pass((name, synonym) => name === synonym);
  pass((name, synonym) => ` ${name} `.includes(` ${synonym} `));
  return found;
}

/** Correspondance donnée par le patient ⇒ numéros de colonnes. Nom introuvable ⇒ erreur claire. */
function resolveGivenMapping(
  headers: readonly string[],
  mapping: ImportMapping,
): Partial<Record<ImportColumn, number>> {
  const names = headers.map(normalizeHeader);
  const resolved: Partial<Record<ImportColumn, number>> = {};
  for (const role of ROLES) {
    const wanted = mapping[role];
    if (wanted === undefined) continue;
    const exact = headers.indexOf(wanted);
    const index = exact >= 0 ? exact : names.indexOf(normalizeHeader(wanted));
    if (index < 0) {
      throw new ImportFileError('UNKNOWN_COLUMN', `Colonne « ${wanted} » absente du fichier`, [
        ...headers,
      ]);
    }
    resolved[role] = index;
  }
  return resolved;
}

/** Espaces de milliers acceptés : espace, espace insécable, espace fine insécable. */
const THOUSANDS_SPACES = /[ \u00a0\u202f]/g;
const DECIMAL = /^\d+(?:[.,]\d+)?$/;

/**
 * Lit une valeur numérique : virgule OU point décimal, espaces de milliers (« 1 870 »). Tout le reste
 * (vide, texte, signe, « 1,2,3 », « 1.234,5 ») ⇒ null : la ligne sera signalée illisible (L4-03).
 */
export function parseDecimal(raw: string): number | null {
  const compact = raw.trim().replace(THOUSANDS_SPACES, '');
  if (!DECIMAL.test(compact)) return null;
  return Number(compact.replace(',', '.'));
}

const cell = (fields: readonly string[], index: number | undefined): string | undefined => {
  if (index === undefined) return undefined;
  const value = fields[index]?.trim();
  return value ? value : undefined;
};

/**
 * Lignes non vides du fichier (la première est l'en-tête) ⇒ tableau d'import. `mapping` : correspondance
 * choisie par le patient (sinon détection automatique). Lève `ImportFileError` seulement pour un problème
 * de FICHIER ; les lignes, même abîmées, sont toujours rendues.
 */
export function buildTable(records: readonly ImportRecord[], mapping?: ImportMapping): ImportTable {
  const [header, ...data] = records;
  if (!header || data.length === 0) {
    throw new ImportFileError('EMPTY', 'Aucune ligne de mesure dans le fichier');
  }
  if (data.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError('TOO_MANY_ROWS', `Trop de lignes (maximum ${IMPORT_MAX_ROWS})`);
  }
  const headers = header.fields.map((h) => h.trim());

  const roles = mapping ? resolveGivenMapping(headers, mapping) : detectMapping(headers);
  const { date, value } = roles;
  if (date === undefined || value === undefined) {
    throw new ImportFileError(
      'MISSING_COLUMNS',
      'Colonnes de date ou de valeur introuvables',
      headers,
    );
  }
  const resolved: ResolvedMapping = { ...roles, date, value };

  const rows = data.map(({ line, fields }): ImportRow => {
    const rawValue = fields[value]?.trim() ?? '';
    return {
      line,
      date: fields[date]?.trim() ?? '',
      time: cell(fields, resolved.time),
      rawValue,
      value: parseDecimal(rawValue),
      unit: cell(fields, resolved.unit),
      context: cell(fields, resolved.context),
      columnMismatch: fields.length !== headers.length,
    };
  });

  return { headers, mapping: resolved, rows };
}
