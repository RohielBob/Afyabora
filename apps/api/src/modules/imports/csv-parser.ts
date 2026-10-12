// Analyseur CSV de l'import (L4-01, CDC F5). Fonctions PURES : octets du fichier ⇒ lignes lisibles.
//
// Ce que fait ce fichier :
//  1. ENCODAGE : UTF-8 (avec ou sans BOM), UTF-16 avec BOM (export « texte Unicode » d'Excel), sinon
//     Windows-1252 (Excel français sous Windows). Un fichier qui n'est pas de l'UTF-8 valide est relu en
//     Windows-1252 : « é » ne devient jamais « Ã© » ni « \uFFFD ».
//  2. SÉPARATEUR : « ; », tabulation ou « , », choisi d'après la régularité des colonnes (voir
//     `detectDelimiter`). Une première ligne Excel « sep=; » l'impose.
//  3. COLONNES : date, heure, valeur, unité, contexte reconnues d'après l'en-tête (avec ou sans accents ni
//     majuscules) ; la correspondance donnée par le patient passe avant.
//  4. NOMBRES : « 0,92 » et « 0.92 » ⇒ 0.92 ; « 1 870 » ⇒ 1870 ; le reste ⇒ null (« illisible »).
//
// Ce qu'il ne fait PAS (L4-03) : lire les dates, convertir les unités, décider VALID / DUPLICATE /
// INCONSISTENT / ERROR. Il ne plante jamais sur une ligne : une ligne bizarre est rendue telle quelle,
// avec son numéro, pour que le rapport puisse la montrer au patient.
//
// Numéro de ligne = ligne du FICHIER (l'en-tête est la ligne 1, les lignes vides comptent), comme dans
// `scripts/sample-data/generate_import_demo.py` et le rapport d'import (« ligne 42 »).
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type importColumnMappingSchema,
} from '@glyka/shared';
import Papa from 'papaparse';
import type { z } from 'zod';

export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type CsvDelimiter = ';' | '\t' | ',';
export type CsvColumn = 'date' | 'time' | 'value' | 'unit' | 'context';
/** Correspondance donnée par le patient : nom de colonne de l'en-tête pour chaque rôle. */
export type CsvMapping = z.infer<typeof importColumnMappingSchema>;
/** Correspondance retenue : numéro de colonne (0 = première) pour chaque rôle trouvé. */
export type ResolvedMapping = { date: number; value: number } & Partial<
  Record<'time' | 'unit' | 'context', number>
>;

/** Une ligne de données, textes nettoyés des espaces autour. Rien n'est encore validé. */
export interface CsvRow {
  /** Numéro de ligne dans le fichier (en-tête = 1). */
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

export interface ParsedCsv {
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
  headers: string[];
  mapping: ResolvedMapping;
  rows: CsvRow[];
}

export type CsvErrorCode =
  | 'EMPTY' // aucun contenu, ou seulement un en-tête
  | 'TOO_LARGE' // plus de IMPORT_MAX_FILE_BYTES
  | 'TOO_MANY_ROWS' // plus de IMPORT_MAX_ROWS lignes de données
  | 'NOT_TABULAR' // une seule colonne : ce n'est pas un tableau lisible
  | 'UNKNOWN_COLUMN' // la correspondance donnée cite une colonne absente de l'en-tête
  | 'MISSING_COLUMNS'; // date ou valeur introuvable : le patient doit indiquer les colonnes

/**
 * Erreur claire sur le FICHIER entier (jamais sur une ligne). `headers` est rempli quand l'en-tête a été
 * lu, pour que l'appli propose de choisir les colonnes (L4-06).
 */
export class CsvImportError extends Error {
  constructor(
    readonly code: CsvErrorCode,
    message: string,
    readonly headers: string[] = [],
  ) {
    super(message);
    this.name = 'CsvImportError';
  }
}

/** Nombre de lignes examinées pour choisir le séparateur. */
export const DELIMITER_SAMPLE_LINES = 20;

const DELIMITERS: readonly CsvDelimiter[] = [';', '\t', ','];

/**
 * Octets 0x80 à 0x9F de Windows-1252 (table WHATWG). Le `TextDecoder('windows-1252')` de Node les lit
 * comme du Latin-1 (caractères de contrôle invisibles) : « ’ », « œ », « € », « … » seraient perdus. On
 * décode donc nous-mêmes : 0x00–0x7F et 0xA0–0xFF = même code Unicode ; ici, la plage qui diffère.
 * 0 = octet non attribué (0x81, 0x8D, 0x8F, 0x90, 0x9D) ⇒ U+FFFD.
 */
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0, 0x017e, 0x0178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    const code = byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] || 0xfffd : byte;
    text += String.fromCharCode(code);
  }
  return text;
}

/**
 * Lit les octets en texte. Ordre : BOM UTF-16 ⇒ UTF-16 ; UTF-8 valide (BOM retiré) ⇒ UTF-8 ; sinon
 * Windows-1252. Le décodeur UTF-8 est « strict » (`fatal`) : un seul octet invalide ⇒ Windows-1252.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: decodeWindows1252(bytes), encoding: 'windows-1252' };
  }
}

/** Ligne Excel « sep=; » en tête de fichier : impose le séparateur. */
const SEP_HINT = /^sep=(;|,|\t)\r?\n/i;

/** Découpe tout le texte avec un séparateur donné (guillemets respectés). */
function splitWith(text: string, delimiter: CsvDelimiter, preview?: number): string[][] {
  return Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy', preview }).data;
}

/**
 * Choisit le séparateur : pour chaque candidat, on découpe les premières lignes non vides ; il faut au
 * moins 2 colonnes dans l'en-tête, et on garde le candidat dont le plus de lignes ont autant de colonnes
 * que l'en-tête (à égalité : le plus de colonnes, puis l'ordre « ; », tabulation, « , »).
 * Exemple : « 18/08/2026;07:15;0,92 » ⇒ « , » donnerait un en-tête d'une seule colonne et des lignes
 * irrégulières ; « ; » donne 5 colonnes partout. Renvoie null si aucun candidat n'a 2 colonnes.
 */
export function detectDelimiter(text: string): CsvDelimiter | null {
  let best: { delimiter: CsvDelimiter; regular: number; columns: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const sample = splitWith(text, delimiter, DELIMITER_SAMPLE_LINES);
    const columns = sample[0]?.length ?? 0;
    if (columns < 2) continue;
    const regular = sample.filter((row) => row.length === columns).length / sample.length;
    if (!best || regular > best.regular || (regular === best.regular && columns > best.columns)) {
      best = { delimiter, regular, columns };
    }
  }
  return best?.delimiter ?? null;
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
export const HEADER_SYNONYMS: Readonly<Record<CsvColumn, readonly string[]>> = {
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

const ROLES = Object.keys(HEADER_SYNONYMS) as CsvColumn[];

/**
 * Reconnaît les colonnes d'après l'en-tête. 1er passage : nom exact (« Glycémie » ⇒ valeur) ; 2e passage :
 * nom qui CONTIENT un mot reconnu (« Glycémie (g/L) », « Date du relevé »). Une colonne ne sert qu'une fois.
 */
export function detectMapping(headers: readonly string[]): Partial<Record<CsvColumn, number>> {
  const names = headers.map(normalizeHeader);
  const found: Partial<Record<CsvColumn, number>> = {};
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
  mapping: CsvMapping,
): Partial<Record<CsvColumn, number>> {
  const names = headers.map(normalizeHeader);
  const resolved: Partial<Record<CsvColumn, number>> = {};
  for (const role of ROLES) {
    const wanted = mapping[role];
    if (wanted === undefined) continue;
    const exact = headers.indexOf(wanted);
    const index = exact >= 0 ? exact : names.indexOf(normalizeHeader(wanted));
    if (index < 0) {
      throw new CsvImportError('UNKNOWN_COLUMN', `Colonne « ${wanted} » absente du fichier`, [
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

/** Début (en caractères) de chaque ligne physique du texte : sert à retrouver le numéro de ligne. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
  return starts;
}

const cell = (fields: readonly string[], index: number | undefined): string | undefined => {
  if (index === undefined) return undefined;
  const value = fields[index]?.trim();
  return value ? value : undefined;
};

/**
 * Analyse un fichier CSV complet. `mapping` : correspondance choisie par le patient (sinon détection
 * automatique). Lève `CsvImportError` seulement pour un problème de FICHIER ; les lignes, même abîmées,
 * sont toujours rendues.
 */
export function parseCsv(bytes: Uint8Array, mapping?: CsvMapping): ParsedCsv {
  if (bytes.length > IMPORT_MAX_FILE_BYTES) {
    throw new CsvImportError(
      'TOO_LARGE',
      `Fichier trop volumineux (maximum ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} Mo)`,
    );
  }
  const { text, encoding } = decodeText(bytes);
  if (text.trim() === '') throw new CsvImportError('EMPTY', 'Le fichier est vide');

  // « sep=; » d'Excel : séparateur imposé, et cette ligne n'est pas l'en-tête (elle compte quand même).
  const hint = SEP_HINT.exec(text);
  const body = hint ? text.slice(hint[0].length) : text;
  const delimiter = (hint?.[1] as CsvDelimiter | undefined) ?? detectDelimiter(body);
  if (!delimiter) {
    throw new CsvImportError(
      'NOT_TABULAR',
      'Colonnes introuvables : utilisez « ; », « , » ou une tabulation',
    );
  }

  // Découpage ligne à ligne pour garder la position de chaque enregistrement dans le fichier (un champ
  // entre guillemets peut contenir un retour à la ligne : on ne peut pas compter les enregistrements).
  const starts = lineStarts(text);
  const offset = hint ? hint[0].length : 0;
  const records: { line: number; fields: string[] }[] = [];
  let cursor = 0;
  let lineIndex = 0;
  Papa.parse<string[]>(body, {
    delimiter,
    skipEmptyLines: false,
    step: (result) => {
      const start = offset + cursor;
      cursor = result.meta.cursor;
      while (lineIndex + 1 < starts.length && (starts[lineIndex + 1] ?? Infinity) <= start)
        lineIndex++;
      if (result.data.every((field) => field.trim() === '')) return; // ligne vide : ignorée
      records.push({ line: lineIndex + 1, fields: result.data });
    },
  });

  const [header, ...data] = records;
  if (!header || data.length === 0)
    throw new CsvImportError('EMPTY', 'Aucune ligne de mesure dans le fichier');
  if (data.length > IMPORT_MAX_ROWS) {
    throw new CsvImportError('TOO_MANY_ROWS', `Trop de lignes (maximum ${IMPORT_MAX_ROWS})`);
  }
  const headers = header.fields.map((h) => h.trim());

  const roles = mapping ? resolveGivenMapping(headers, mapping) : detectMapping(headers);
  const { date, value } = roles;
  if (date === undefined || value === undefined) {
    throw new CsvImportError(
      'MISSING_COLUMNS',
      'Colonnes de date ou de valeur introuvables',
      headers,
    );
  }
  const resolved: ResolvedMapping = { ...roles, date, value };

  const rows = data.map(({ line, fields }): CsvRow => {
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

  return { encoding, delimiter, headers, mapping: resolved, rows };
}
