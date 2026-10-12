// Analyseur CSV de l'import (L4-01, CDC F5). Fonctions PURES : octets du fichier ⇒ lignes lisibles.
//
// Ce que fait ce fichier (la partie propre au CSV) :
//  1. ENCODAGE : UTF-8 (avec ou sans BOM), UTF-16 avec BOM (export « texte Unicode » d'Excel), sinon
//     Windows-1252 (Excel français sous Windows). Un fichier qui n'est pas de l'UTF-8 valide est relu en
//     Windows-1252 : « é » ne devient jamais « Ã© » ni « \ufffd ».
//  2. SÉPARATEUR : « ; », tabulation ou « , », choisi d'après la régularité des colonnes (voir
//     `detectDelimiter`). Une première ligne Excel « sep=; » l'impose.
//  3. NUMÉROS DE LIGNE : ceux du FICHIER (l'en-tête est la ligne 1, les lignes vides comptent), comme dans
//     `scripts/sample-data/generate_import_demo.py` et le rapport d'import (« ligne 42 »).
//
// La suite (colonnes, nombres, erreurs sur le fichier) est commune avec l'Excel : `import-table.ts`.
import { IMPORT_MAX_FILE_BYTES } from '@glyka/shared';
import Papa from 'papaparse';
import {
  ImportFileError,
  buildTable,
  type ImportMapping,
  type ImportRecord,
  type ImportTable,
} from './import-table';

export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type CsvDelimiter = ';' | '\t' | ',';

export interface ParsedCsv extends ImportTable {
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
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

/** Début (en caractères) de chaque ligne physique du texte : sert à retrouver le numéro de ligne. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
  return starts;
}

/**
 * Analyse un fichier CSV complet. `mapping` : correspondance choisie par le patient (sinon détection
 * automatique). Lève `ImportFileError` seulement pour un problème de FICHIER ; les lignes, même abîmées,
 * sont toujours rendues.
 */
export function parseCsv(bytes: Uint8Array, mapping?: ImportMapping): ParsedCsv {
  if (bytes.length > IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError(
      'TOO_LARGE',
      `Fichier trop volumineux (maximum ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} Mo)`,
    );
  }
  const { text, encoding } = decodeText(bytes);
  if (text.trim() === '') throw new ImportFileError('EMPTY', 'Le fichier est vide');

  // « sep=; » d'Excel : séparateur imposé, et cette ligne n'est pas l'en-tête (elle compte quand même).
  const hint = SEP_HINT.exec(text);
  const body = hint ? text.slice(hint[0].length) : text;
  const delimiter = (hint?.[1] as CsvDelimiter | undefined) ?? detectDelimiter(body);
  if (!delimiter) {
    throw new ImportFileError(
      'NOT_TABULAR',
      'Colonnes introuvables : utilisez « ; », « , » ou une tabulation',
    );
  }

  // Découpage ligne à ligne pour garder la position de chaque enregistrement dans le fichier (un champ
  // entre guillemets peut contenir un retour à la ligne : on ne peut pas compter les enregistrements).
  const starts = lineStarts(text);
  const offset = hint ? hint[0].length : 0;
  const records: ImportRecord[] = [];
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

  return { encoding, delimiter, ...buildTable(records, mapping) };
}
