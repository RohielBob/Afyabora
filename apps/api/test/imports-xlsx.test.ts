// Tests du ticket L4-02 : analyseur Excel (.xlsx) de l'import. Les classeurs sont fabriqués ici avec
// `exceljs` (vraies cellules date, heure, nombre, formule…) ; aucune base, aucun réseau.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS } from '@glyka/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/modules/imports/csv-parser';
import { ImportFileError, type ImportErrorCode } from '../src/modules/imports/import-table';
import {
  XLSX_MAX_ENTRIES,
  XLSX_MAX_UNZIPPED_BYTES,
  cellText,
  checkZipDirectory,
  dateText,
  parseXlsx,
} from '../src/modules/imports/xlsx-parser';

const SAMPLES = join(__dirname, '..', '..', '..', 'scripts', 'sample-data');
const sample = (name: string) => new Uint8Array(readFileSync(join(SAMPLES, name)));

const toBytes = async (workbook: ExcelJS.Workbook) =>
  new Uint8Array(await workbook.xlsx.writeBuffer());

/** Classeur d'une feuille, lignes données telles quelles (cellules exceljs). */
const book = async (rows: ExcelJS.CellValue[][], name = 'Mesures') => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(name);
  for (const row of rows) sheet.addRow(row);
  return toBytes(workbook);
};

const errorOf = async (run: () => Promise<unknown>): Promise<ImportFileError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof ImportFileError) return error;
    throw error;
  }
  throw new Error('aucune erreur levée');
};
const codeOf = async (run: () => Promise<unknown>): Promise<ImportErrorCode> =>
  (await errorOf(run)).code;

/** Date affichée dans Excel (Excel n'a pas de fuseau : exceljs la rend en UTC « tel qu'affiché »). */
const excelDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));
const excelTime = (h: number, min: number) => new Date(Date.UTC(1899, 11, 30, h, min));

describe('classeur de démonstration (mêmes 147 lignes que le CSV)', () => {
  it('vraies cellules date / heure / nombre : 147 lignes, numéros Excel, ligne 42 = 18,7', async () => {
    const csv = parseCsv(sample('import-demo-147.csv'));
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Glycémies');
    sheet.addRow(['Date', 'Heure', 'Glycémie', 'Unité', 'Contexte']);
    for (const row of csv.rows) {
      const [d, m, y] = row.date.split('/').map(Number) as [number, number, number];
      const [h, min] = (row.time ?? '00:00').split(':').map(Number) as [number, number];
      const added = sheet.addRow([
        excelDate(y, m, d),
        excelTime(h, min),
        row.value,
        row.unit,
        row.context,
      ]);
      added.getCell(1).numFmt = 'dd/mm/yyyy';
      added.getCell(2).numFmt = 'hh:mm';
      added.getCell(3).numFmt = '0.00';
    }

    const parsed = await parseXlsx(await toBytes(workbook));
    expect(parsed.sheet).toBe('Glycémies');
    expect(parsed.headers).toEqual(['Date', 'Heure', 'Glycémie', 'Unité', 'Contexte']);
    expect(parsed.mapping).toEqual({ date: 0, time: 1, value: 2, unit: 3, context: 4 });
    expect(parsed.rows).toHaveLength(147);
    expect(parsed.rows[0]).toEqual({
      line: 2,
      date: '2026-08-18',
      time: '07:15',
      rawValue: '0.92',
      value: 0.92,
      unit: 'g/L',
      context: 'à jeun',
      columnMismatch: false,
    });
    const byLine = new Map(parsed.rows.map((r) => [r.line, r]));
    expect(byLine.get(42)?.value).toBe(18.7);
    expect(byLine.get(90)?.value).toBe(0.02);
    expect(byLine.get(121)?.value).toBe(9.9);
    // Même contenu que le CSV, ligne par ligne (valeurs, unités, contextes).
    expect(parsed.rows.map((r) => [r.line, r.value, r.unit, r.context])).toEqual(
      csv.rows.map((r) => [r.line, r.value, r.unit, r.context]),
    );
  });
});

describe('fichiers illisibles : erreur claire, jamais de plantage', () => {
  it('scripts/sample-data/import-corrupted.xlsx ⇒ CORRUPTED', async () => {
    const error = await errorOf(() => parseXlsx(sample('import-corrupted.xlsx')));
    expect(error.code).toBe('CORRUPTED');
    expect(error.message).toContain('illisible');
  });

  it('pas un ZIP, ZIP tronqué, ZIP valide mais pas un classeur ⇒ CORRUPTED', async () => {
    expect(await codeOf(() => parseXlsx(new TextEncoder().encode('date;valeur\n1;2\n')))).toBe(
      'CORRUPTED',
    );
    const good = await book([['Date', 'Valeur']]);
    expect(await codeOf(() => parseXlsx(good.slice(0, good.length - 30)))).toBe('CORRUPTED');
    // ZIP correct, vide : la lecture d'exceljs échoue, l'erreur est traduite.
    expect(await codeOf(() => parseXlsx(zipWith([])))).toBe('CORRUPTED');
  });

  it('ancien .xls ou classeur protégé (format OLE) ⇒ UNSUPPORTED_FORMAT', async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const error = await errorOf(() => parseXlsx(ole));
    expect(error.code).toBe('UNSUPPORTED_FORMAT');
    expect(error.message).toContain('.xlsx');
    // Les 8 octets comptent : un seul différent ⇒ pas OLE (donc ici : illisible).
    expect(await codeOf(() => parseXlsx(Uint8Array.from([...ole.slice(0, 7), 0])))).toBe(
      'CORRUPTED',
    );
  });

  it('vide ⇒ EMPTY ; plus de 5 Mo ⇒ TOO_LARGE avant toute lecture', async () => {
    expect(await codeOf(() => parseXlsx(new Uint8Array()))).toBe('EMPTY');
    expect(await codeOf(() => parseXlsx(new Uint8Array(IMPORT_MAX_FILE_BYTES + 1)))).toBe(
      'TOO_LARGE',
    );
  });
});

/**
 * ZIP minimal fabriqué à la main : seulement le répertoire central (entrées déclarées) et sa fin. Assez
 * pour tester `checkZipDirectory`, qui ne lit que ces tailles déclarées.
 */
function zipWith(sizes: number[], options: { badSignature?: boolean; offset?: number } = {}) {
  const entries = sizes.map((size, i) => {
    const name = new TextEncoder().encode(`f${i}.xml`);
    const entry = new Uint8Array(46 + name.length + 3 + 2);
    const view = new DataView(entry.buffer);
    view.setUint32(0, options.badSignature ? 0x12345678 : 0x02014b50, true);
    view.setUint32(24, size, true);
    view.setUint16(28, name.length, true);
    view.setUint16(30, 3, true); // champ « extra » de 3 octets
    view.setUint16(32, 2, true); // commentaire de 2 octets
    entry.set(name, 46);
    return entry;
  });
  const directory = entries.reduce((n, e) => n + e.length, 0);
  const end = new Uint8Array(22 + 4); // + commentaire de 4 octets en fin de ZIP
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, sizes.length, true);
  view.setUint16(10, sizes.length, true);
  view.setUint32(12, directory, true);
  view.setUint32(16, options.offset ?? 0, true);
  view.setUint16(20, 4, true);
  const zip = new Uint8Array(directory + end.length);
  let at = 0;
  for (const e of entries) {
    zip.set(e, at);
    at += e.length;
  }
  zip.set(end, at);
  return zip;
}

describe('ZIP : contrôles avant décompression (bombe zip)', () => {
  it('vrai classeur : quelques fichiers, petite taille décompressée', async () => {
    const { entries, unzippedBytes } = checkZipDirectory(await book([['Date', 'Valeur']]));
    expect(entries).toBeGreaterThan(3);
    expect(unzippedBytes).toBeGreaterThan(0);
    expect(unzippedBytes).toBeLessThan(XLSX_MAX_UNZIPPED_BYTES);
  });

  it('tailles additionnées, extra et commentaires sautés ; la limite exacte passe', () => {
    expect(checkZipDirectory(zipWith([10, 20, 30]))).toEqual({ entries: 3, unzippedBytes: 60 });
    const half = XLSX_MAX_UNZIPPED_BYTES / 2;
    expect(checkZipDirectory(zipWith([half, half])).unzippedBytes).toBe(XLSX_MAX_UNZIPPED_BYTES);
    expect(() => checkZipDirectory(zipWith([half, half + 1]))).toThrow(ImportFileError);
  });

  it('décompressé trop gros ou ZIP64 ⇒ TOO_LARGE, avant toute ouverture du classeur', async () => {
    expect(await codeOf(async () => parseXlsx(zipWith([XLSX_MAX_UNZIPPED_BYTES + 1])))).toBe(
      'TOO_LARGE',
    );
    expect(await codeOf(async () => checkZipDirectory(zipWith([0xffffffff])))).toBe('TOO_LARGE');
  });

  it(`plus de ${XLSX_MAX_ENTRIES} fichiers ⇒ TOO_LARGE ; exactement ${XLSX_MAX_ENTRIES} ⇒ accepté`, () => {
    expect(checkZipDirectory(zipWith(Array(XLSX_MAX_ENTRIES).fill(1))).entries).toBe(
      XLSX_MAX_ENTRIES,
    );
    expect(() => checkZipDirectory(zipWith(Array(XLSX_MAX_ENTRIES + 1).fill(1)))).toThrow(
      /trop de fichiers/,
    );
  });

  it('répertoire central faux ou hors du fichier ⇒ CORRUPTED', async () => {
    expect(await codeOf(async () => checkZipDirectory(zipWith([10], { badSignature: true })))).toBe(
      'CORRUPTED',
    );
    expect(await codeOf(async () => checkZipDirectory(zipWith([10], { offset: 10_000 })))).toBe(
      'CORRUPTED',
    );
    expect(await codeOf(async () => checkZipDirectory(new Uint8Array(21)))).toBe('CORRUPTED');
  });

  it('fin de ZIP trouvée même derrière un long commentaire (jusqu’à 65 535 octets)', () => {
    const zip = zipWith([10]);
    const view = new DataView(zip.buffer);
    view.setUint16(zip.length - 26 + 20, 0xffff, true);
    const withComment = new Uint8Array(zip.length - 4 + 0xffff);
    withComment.set(zip.slice(0, zip.length - 4));
    expect(checkZipDirectory(withComment).entries).toBe(1);
    // Un octet de plus que le maximum : la fin n'est plus cherchée aussi loin.
    const tooFar = new Uint8Array(withComment.length + 1);
    tooFar.set(withComment);
    expect(() => checkZipDirectory(tooFar)).toThrow(ImportFileError);
  });
});

/** CRC-32 (celui des ZIP), pour fabriquer un vrai ZIP sans dépendance. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Vrai ZIP, fichiers stockés sans compression (méthode 0) : en-têtes locaux, répertoire central, fin. */
function storedZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, centrals.length, true);
  e.setUint16(10, centrals.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const zip = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

describe('classeur écrit comme par Excel (XML brut, sans exceljs pour l’écrire)', () => {
  it('dates en nombre de jours (formats intégrés 14, 20, 22), textes partagés, formule, erreur', async () => {
    const bytes = storedZip({
      '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CT}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/></Types>`,
      '_rels/.rels': `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      // Styles : 1 = jj/mm/aaaa (14), 2 = h:mm (20), 3 = jj/mm/aaaa h:mm (22) — formats intégrés d'Excel.
      'xl/styles.xml': `${XML}<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="20" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
      'xl/sharedStrings.xml': `${XML}<sst xmlns="${MAIN}" count="6" uniqueCount="6"><si><t>Date</t></si><si><t>Heure</t></si><si><t>Glycémie (g/L)</t></si><si><t>Contexte</t></si><si><t>à jeun</t></si><si><r><t>après </t></r><r><rPr><b/></rPr><t>repas</t></r></si></sst>`,
      // 46296 = 01/10/2026 ; 0,302083… = 07:15 ; 46297,8125 = 02/10/2026 19:30.
      'xl/worksheets/sheet1.xml': `${XML}<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" s="1"><v>46296</v></c><c r="B2" s="2"><v>0.30208333333333331</v></c><c r="C2"><v>0.92</v></c><c r="D2" t="s"><v>4</v></c></row><row r="3"><c r="A3" s="3"><v>46297.8125</v></c><c r="C3"><f>C2*2</f><v>1.84</v></c><c r="D3" t="s"><v>5</v></c></row><row r="4"><c r="A4" t="str"><v>03/10/2026</v></c><c r="B4" t="inlineStr"><is><t>08:00</t></is></c><c r="C4" t="e"><v>#N/A</v></c></row></sheetData></worksheet>`,
    });
    const parsed = await parseXlsx(bytes);
    expect(parsed.sheet).toBe('Feuil1');
    expect(parsed.mapping).toEqual({ date: 0, time: 1, value: 2, context: 3 });
    expect(
      parsed.rows.map((r) => [
        r.line,
        r.date,
        r.time,
        r.rawValue,
        r.value,
        r.context,
        r.columnMismatch,
      ]),
    ).toEqual([
      [2, '2026-10-01', '07:15', '0.92', 0.92, 'à jeun', false],
      [3, '2026-10-02 19:30', undefined, '1.84', 1.84, 'après repas', false],
      [4, '03/10/2026', '08:00', '#N/A', null, undefined, false],
    ]);
  });
});

describe('cellules Excel ⇒ texte', () => {
  it('dates : jour seul, jour + heure, heure seule, secondes, arrondi à la seconde', () => {
    expect(dateText(excelDate(2026, 10, 1))).toBe('2026-10-01');
    expect(dateText(excelDate(2026, 10, 1, 7, 15))).toBe('2026-10-01 07:15');
    expect(dateText(excelTime(7, 15))).toBe('07:15');
    expect(dateText(excelTime(0, 0))).toBe('00:00');
    expect(dateText(new Date(Date.UTC(1899, 11, 30, 7, 15, 30)))).toBe('07:15:30');
    expect(dateText(new Date(Date.UTC(2026, 9, 1, 0, 0, 5)))).toBe('2026-10-01 00:00:05');
    // 07:15 stocké comme 07:14:59,9996 par Excel ⇒ 07:15.
    expect(dateText(new Date(Date.UTC(1899, 11, 30, 7, 14, 59, 999.6)))).toBe('07:15');
    expect(dateText(new Date(Date.UTC(2026, 9, 1, 23, 59, 59, 600)))).toBe('2026-10-02');
    // Le 31/12/1899 n'est pas « heure seule ».
    expect(dateText(new Date(Date.UTC(1899, 11, 31, 7, 15)))).toBe('1899-12-31 07:15');
  });

  it('nombre, texte, booléen, vide, formule, texte enrichi, lien, erreur', () => {
    expect(cellText(0.92)).toBe('0.92');
    expect(cellText(110)).toBe('110');
    expect(cellText(0.1 + 0.2)).toBe('0.3');
    expect(cellText('1,1')).toBe('1,1');
    expect(cellText(true)).toBe('true');
    expect(cellText(false)).toBe('false');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText({ formula: 'A1/100', result: 1.25 })).toBe('1.25');
    expect(cellText({ sharedFormula: 'B2', result: 'à jeun' } as ExcelJS.CellValue)).toBe('à jeun');
    expect(cellText({ formula: 'A1', result: excelDate(2026, 10, 1) } as ExcelJS.CellValue)).toBe(
      '2026-10-01',
    );
    expect(cellText({ formula: 'A1' } as ExcelJS.CellValue)).toBe('');
    expect(cellText({ richText: [{ text: 'avant ' }, { text: 'repas' }] })).toBe('avant repas');
    expect(cellText({ text: 'note', hyperlink: 'https://exemple.org' })).toBe('note');
    expect(cellText({ error: '#N/A' } as ExcelJS.CellValue)).toBe('#N/A');
  });
});

describe('feuilles, lignes et colonnes', () => {
  it('première feuille vide ⇒ la suivante ; feuille masquée seulement si aucune visible', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Vide');
    const hidden = workbook.addWorksheet('Brouillon', { state: 'hidden' });
    hidden.addRow(['Date', 'Valeur']);
    hidden.addRow([excelDate(2026, 10, 1), 1]);
    const visible = workbook.addWorksheet('Mesures');
    visible.addRow(['Date', 'Valeur']);
    visible.addRow([excelDate(2026, 10, 2), 2]);
    expect((await parseXlsx(await toBytes(workbook))).sheet).toBe('Mesures');

    const onlyHidden = new ExcelJS.Workbook();
    onlyHidden.addWorksheet('Vide');
    const h = onlyHidden.addWorksheet('Cachée', { state: 'hidden' });
    h.addRow(['Date', 'Valeur']);
    h.addRow([excelDate(2026, 10, 1), 1]);
    const parsed = await parseXlsx(await toBytes(onlyHidden));
    expect(parsed.sheet).toBe('Cachée');
    expect(parsed.rows[0]?.date).toBe('2026-10-01');
  });

  it('classeur sans aucune donnée ⇒ EMPTY ; en-tête seul ⇒ EMPTY', async () => {
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet('Feuil1');
    expect(await codeOf(async () => parseXlsx(await toBytes(empty)))).toBe('EMPTY');
    expect(await codeOf(async () => parseXlsx(await book([['Date', 'Valeur']])))).toBe('EMPTY');
  });

  it('tableau décalé (ligne 3, colonne B) : numéros de ligne Excel, colonne A vide ignorée', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mesures');
    sheet.getCell('B3').value = 'Date';
    sheet.getCell('C3').value = 'Glycémie (mg/dL)';
    sheet.getCell('B4').value = excelDate(2026, 10, 1, 7, 15);
    sheet.getCell('C4').value = 95;
    sheet.getCell('B6').value = excelDate(2026, 10, 2, 7, 20);
    sheet.getCell('C6').value = 101;
    const parsed = await parseXlsx(await toBytes(workbook));
    expect(parsed.headers).toEqual(['', 'Date', 'Glycémie (mg/dL)']);
    expect(parsed.mapping).toEqual({ date: 1, value: 2 });
    expect(parsed.rows.map((r) => [r.line, r.date, r.value, r.columnMismatch])).toEqual([
      [4, '2026-10-01 07:15', 95, false],
      [6, '2026-10-02 07:20', 101, false],
    ]);
  });

  it('cellules vides en fin de ligne : normal ; valeur hors de l’en-tête : ligne marquée', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mesures');
    sheet.addRow(['Date', 'Valeur', 'Contexte']);
    sheet.addRow([excelDate(2026, 10, 1), 1.1]); // contexte vide
    sheet.addRow([excelDate(2026, 10, 2), 1.2, 'à jeun', 'en trop']);
    sheet.addRow([excelDate(2026, 10, 3), 1.3, 'repas']);
    sheet.getCell('E4').value = '  '; // espaces en fin de ligne : pas une valeur en trop
    sheet.getCell('B6').value = ' '; // ligne qui ne contient que des espaces : ignorée
    const parsed = await parseXlsx(await toBytes(workbook));
    expect(parsed.rows.map((r) => [r.line, r.context, r.columnMismatch])).toEqual([
      [2, undefined, false],
      [3, 'à jeun', true],
      [4, 'repas', false],
    ]);
  });

  it('nombres écrits en texte (« 0,92 », « 1 870 ») et cellules illisibles', async () => {
    const parsed = await parseXlsx(
      await book([
        ['Date', 'Valeur'],
        ['01/10/2026', '0,92'],
        ['02/10/2026', '1 870'],
        ['03/10/2026', { error: '#DIV/0!' } as ExcelJS.CellValue],
        ['04/10/2026', { formula: 'B2*100', result: 92 }],
      ]),
    );
    expect(parsed.rows.map((r) => [r.date, r.rawValue, r.value])).toEqual([
      ['01/10/2026', '0,92', 0.92],
      ['02/10/2026', '1 870', 1870],
      ['03/10/2026', '#DIV/0!', null],
      ['04/10/2026', '92', 92],
    ]);
  });

  it('correspondance donnée, colonnes introuvables (avec en-têtes), trop de lignes', async () => {
    const bytes = await book([
      ['Quand', 'Combien'],
      [excelDate(2026, 10, 1), 1.1],
    ]);
    const error = await errorOf(() => parseXlsx(bytes));
    expect(error.code).toBe('MISSING_COLUMNS');
    expect(error.headers).toEqual(['Quand', 'Combien']);
    const parsed = await parseXlsx(bytes, { date: 'Quand', value: 'Combien' });
    expect(parsed.rows[0]).toMatchObject({ date: '2026-10-01', value: 1.1 });

    const rows = (n: number) => [
      ['Date', 'Valeur'],
      ...Array.from({ length: n }, () => ['01/10/2026', 1]),
    ];
    expect((await parseXlsx(await book(rows(IMPORT_MAX_ROWS)))).rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(await codeOf(async () => parseXlsx(await book(rows(IMPORT_MAX_ROWS + 1))))).toBe(
      'TOO_MANY_ROWS',
    );
  });
});
