// Analyseur Excel (.xlsx) de l'import (L4-02, CDC F5) : octets du classeur ⇒ mêmes lignes que le CSV.
//
// Ce que fait ce fichier (la partie propre à Excel) :
//  1. CONTRÔLES AVANT LECTURE, sans décompresser :
//     - un .xlsx est un fichier ZIP : on lit seulement son « sommaire » (répertoire central) ;
//     - abîmé ou pas un ZIP ⇒ « classeur illisible » ;
//     - ancien .xls, ou classeur protégé par mot de passe (tous deux au format OLE) ⇒ message dédié ;
//     - décompressé trop gros (« bombe zip ») ou trop de fichiers dedans ⇒ refusé avant ouverture.
//  2. FEUILLE : la première feuille visible qui contient des données (sinon une feuille masquée).
//  3. CELLULES ⇒ TEXTE, pour réutiliser exactement la suite du CSV (`import-table.ts`) :
//     - date ⇒ « aaaa-mm-jj » (ou « aaaa-mm-jj HH:MM ») ; heure seule ⇒ « HH:MM » (secondes si présentes) ;
//     - nombre ⇒ « 0.92 » (bruit d'arrondi d'Excel retiré) ;
//     - formule ⇒ son résultat ; texte enrichi ou lien ⇒ son texte ; erreur (#N/A) ⇒ « #N/A » (illisible).
//     Excel n'a pas de fuseau horaire : la date est rendue telle qu'affichée dans la cellule.
//  4. NUMÉROS DE LIGNE : ceux d'Excel (ce que voit le patient dans son classeur).
//
// Lecture avec `exceljs` (déjà dépendance de l'API).
import { IMPORT_MAX_FILE_BYTES } from '@glyka/shared';
import ExcelJS from 'exceljs';
import {
  ImportFileError,
  buildTable,
  type ImportMapping,
  type ImportRecord,
  type ImportTable,
} from './import-table';

export interface ParsedXlsx extends ImportTable {
  /** Nom de la feuille lue (montré au patient : « feuille Mesures »). */
  sheet: string;
}

/** Taille maximale du classeur une fois décompressé (5 000 lignes tiennent largement dans 1 Mo). */
export const XLSX_MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
/** Nombre maximal de fichiers dans le ZIP (un classeur simple en contient une dizaine). */
export const XLSX_MAX_ENTRIES = 1000;

/** Signature des fichiers OLE : ancien Excel (.xls) et classeurs .xlsx chiffrés par mot de passe. */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_END_SIGNATURE = 0x06054b50; // « fin du répertoire central »
const ZIP_ENTRY_SIGNATURE = 0x02014b50; // une entrée du répertoire central
const ZIP_END_MIN_SIZE = 22;
const ZIP_MAX_COMMENT = 0xffff;

const corrupted = () =>
  new ImportFileError(
    'CORRUPTED',
    'Classeur Excel illisible : le fichier est abîmé ou n’est pas un classeur .xlsx',
  );

/**
 * Lit le répertoire central du ZIP (sans rien décompresser) : nombre de fichiers et taille totale une
 * fois décompressé, telles que déclarées. Lève CORRUPTED si le ZIP est illisible, TOO_LARGE si c'est trop.
 * Limite : un ZIP falsifié peut déclarer des tailles fausses ; la limite de 5 Mo du fichier reste la
 * première protection.
 */
export function checkZipDirectory(bytes: Uint8Array): { entries: number; unzippedBytes: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - ZIP_END_MIN_SIZE - ZIP_MAX_COMMENT);
  let end = -1;
  for (let at = bytes.length - ZIP_END_MIN_SIZE; at >= lowest; at--) {
    if (view.getUint32(at, true) === ZIP_END_SIGNATURE) {
      end = at;
      break;
    }
  }
  if (end < 0) throw corrupted();

  const entries = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (entries > XLSX_MAX_ENTRIES) {
    throw new ImportFileError('TOO_LARGE', 'Classeur trop complexe (trop de fichiers internes)');
  }
  let at = directoryOffset;
  let unzippedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== ZIP_ENTRY_SIGNATURE) {
      throw corrupted();
    }
    // Un ZIP64 (fichier de plus de 4 Go) déclare ici 0xFFFFFFFF : au-dessus de la limite, donc refusé.
    unzippedBytes += view.getUint32(at + 24, true);
    at +=
      46 +
      view.getUint16(at + 28, true) +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
  if (unzippedBytes > XLSX_MAX_UNZIPPED_BYTES) {
    throw new ImportFileError('TOO_LARGE', 'Classeur trop volumineux une fois décompressé');
  }
  return { entries, unzippedBytes };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date Excel ⇒ texte. Heure seule (jour 0 d'Excel : 30/12/1899) ⇒ « HH:MM » ; minuit ⇒ date seule. */
export function dateText(date: Date): string {
  // Excel stocke l'heure en fraction de jour : 07:15 peut revenir en 07:14:59,999. On arrondit à la seconde.
  const d = new Date(Math.round(date.getTime() / 1000) * 1000);
  const seconds = d.getUTCSeconds();
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(seconds)}` : ''}`;
  if (d.getUTCFullYear() === 1899 && d.getUTCMonth() === 11 && d.getUTCDate() === 30) return time;
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return d.getUTCHours() || d.getUTCMinutes() || seconds ? `${day} ${time}` : day;
}

/**
 * Contenu d'une cellule ⇒ texte (voir l'en-tête du fichier). Les nombres gardent 12 chiffres
 * significatifs : 0.1 + 0.2 calculé par Excel donne « 0.3 », pas « 0.30000000000000004 ».
 */
export function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(Number(value.toPrecision(12)));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return dateText(value);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('error' in value) return String(value.error);
  if ('hyperlink' in value) return cellText(value.text as ExcelJS.CellValue);
  if ('result' in value || 'formula' in value || 'sharedFormula' in value) {
    return cellText((value as { result?: ExcelJS.CellValue }).result);
  }
  return '';
}

/** Feuille lue : la première visible avec des données, sinon la première masquée avec des données. */
function pickSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const withData = workbook.worksheets.filter((sheet) => sheet.actualRowCount > 0);
  return withData.find((sheet) => sheet.state === 'visible') ?? withData[0];
}

/** Lignes non vides de la feuille, en texte ; une cellule vide en fin de ligne ne compte pas. */
function sheetRecords(sheet: ExcelJS.Worksheet): ImportRecord[] {
  const records: ImportRecord[] = [];
  let headerWidth = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = (row.values as ExcelJS.CellValue[]).slice(1).map((v) => cellText(v));
    let last = cells.length - 1;
    while (last >= 0 && (cells[last] ?? '').trim() === '') last--;
    if (last < 0) return; // ligne seulement mise en forme : ignorée
    if (records.length === 0) headerWidth = last + 1;
    const width = Math.max(headerWidth, last + 1);
    const fields = Array.from({ length: width }, (_, i) => cells[i] ?? '');
    records.push({ line: rowNumber, fields });
  });
  return records;
}

/**
 * Analyse un classeur .xlsx complet (async : `exceljs` lit le ZIP de façon asynchrone). Lève
 * `ImportFileError` seulement pour un problème de FICHIER ; les lignes, même abîmées, sont rendues.
 */
export async function parseXlsx(bytes: Uint8Array, mapping?: ImportMapping): Promise<ParsedXlsx> {
  if (bytes.length > IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError(
      'TOO_LARGE',
      `Fichier trop volumineux (maximum ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} Mo)`,
    );
  }
  if (bytes.length === 0) throw new ImportFileError('EMPTY', 'Le fichier est vide');
  if (OLE_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    throw new ImportFileError(
      'UNSUPPORTED_FORMAT',
      'Ancien format Excel (.xls) ou classeur protégé par mot de passe : enregistrez-le en .xlsx sans mot de passe, ou en CSV',
    );
  }
  checkZipDirectory(bytes);

  const workbook = new ExcelJS.Workbook();
  try {
    // `exceljs` accepte un ArrayBuffer ; `slice()` en fait une copie limitée aux octets du fichier.
    await workbook.xlsx.load(bytes.slice().buffer);
  } catch {
    throw corrupted();
  }
  // Excel enregistre toujours au moins une feuille : un ZIP sans feuille (photos zippées, document Word…)
  // n'est pas un classeur.
  if (workbook.worksheets.length === 0) throw corrupted();
  const sheet = pickSheet(workbook);
  if (!sheet) throw new ImportFileError('EMPTY', 'Le classeur est vide');
  return { sheet: sheet.name, ...buildTable(sheetRecords(sheet), mapping) };
}
