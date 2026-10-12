// Tests du ticket L4-03 : règles de validation de l'import (CDC F5). Fonctions pures : aucune base.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/modules/imports/csv-parser';
import type { ImportRow, ImportTable } from '../src/modules/imports/import-table';
import {
  FUTURE_TOLERANCE_MS,
  REASON_MESSAGES,
  duplicateKey,
  parseContext,
  parseDate,
  parseTime,
  parseUnit,
  validateRows,
  type ValidationOptions,
} from '../src/modules/imports/import-validation';
import { parseXlsx } from '../src/modules/imports/xlsx-parser';

const SAMPLES = join(__dirname, '..', '..', '..', 'scripts', 'sample-data');
const NOW = new Date('2026-10-12T10:00:00Z');
const OPTIONS: ValidationOptions = {
  defaultUnit: 'G_L',
  timezoneOffsetMinutes: 60, // Kinshasa
  now: NOW,
  existing: new Set(),
};

/** Ligne lue fabriquée (comme la rendent les lecteurs CSV / Excel). */
const row = (over: Partial<ImportRow> = {}, line = 2): ImportRow => ({
  line,
  date: '01/10/2026',
  time: '07:15',
  rawValue: over.value === undefined ? '1,1' : String(over.value),
  value: 1.1,
  columnMismatch: false,
  ...over,
});
const table = (...rows: ImportRow[]): ImportTable => ({
  headers: ['date', 'heure', 'valeur'],
  mapping: { date: 0, time: 1, value: 2 },
  rows,
});
/** Valide une seule ligne et la rend (toujours présente : une ligne en entrée, une en sortie). */
const one = (over: Partial<ImportRow>, options: Partial<ValidationOptions> = {}) => {
  const [first] = validateRows(table(row(over)), { ...OPTIONS, ...options }).rows;
  if (!first) throw new Error('aucune ligne validée');
  return first;
};

describe('fichier de démonstration : 139 valides, 5 doublons, 3 incohérentes (CA du CDC)', () => {
  const csv = parseCsv(new Uint8Array(readFileSync(join(SAMPLES, 'import-demo-147.csv'))));

  it('comptes exacts, doublons et incohérentes à leurs lignes', () => {
    const report = validateRows(csv, OPTIONS);
    expect({
      analyzed: report.analyzed,
      valid: report.valid,
      duplicates: report.duplicates,
      inconsistent: report.inconsistent,
      errors: report.errors,
    }).toEqual({ analyzed: 147, valid: 139, duplicates: 5, inconsistent: 3, errors: 0 });
    const lines = (status: string) =>
      report.rows.filter((r) => r.status === status).map((r) => r.line);
    expect(lines('DUPLICATE')).toEqual([20, 38, 65, 104, 138]);
    expect(lines('INCONSISTENT')).toEqual([42, 90, 121]);
    expect(
      report.rows
        .filter((r) => r.status === 'DUPLICATE')
        .every((r) => r.reason === 'DUPLICATE_IN_FILE'),
    ).toBe(true);
  });

  it('ligne 42 : 18,7 g/L ⇒ « valeur inhabituelle, vérifier l’unité », mmol/L proposé', () => {
    const line42 = validateRows(csv, OPTIONS).rows.find((r) => r.line === 42);
    expect(line42).toMatchObject({
      status: 'INCONSISTENT',
      reason: 'OUT_OF_RANGE',
      rawValue: '18,70',
      valueMgDl: 1870,
      originalValue: 18.7,
      originalUnit: 'G_L',
      suggestedUnits: ['MMOL_L'],
    });
    expect(REASON_MESSAGES.OUT_OF_RANGE).toBe("Valeur inhabituelle, vérifier l'unité");
  });

  it('mesure prête à enregistrer : heure locale de Kinshasa ⇒ UTC, mg/dL entier, contexte', () => {
    expect(validateRows(csv, OPTIONS).rows[0]).toEqual({
      line: 2,
      status: 'VALID',
      rawValue: '0,92',
      measuredAt: '2026-08-18T06:15:00.000Z',
      valueMgDl: 92,
      originalValue: 0.92,
      originalUnit: 'G_L',
      context: 'FASTING',
    });
  });

  it('même fichier importé une 2e fois : tout ce qui était valide devient « déjà enregistré »', () => {
    const first = validateRows(csv, OPTIONS);
    const existing = new Set(
      first.rows
        .filter((r) => r.status === 'VALID')
        .map((r) => duplicateKey(new Date(r.measuredAt ?? ''), r.valueMgDl ?? 0)),
    );
    const again = validateRows(csv, { ...OPTIONS, existing });
    expect([again.valid, again.duplicates, again.inconsistent, again.errors]).toEqual([
      0, 144, 3, 0,
    ]);
    expect(again.rows.find((r) => r.line === 20)?.reason).toBe('DUPLICATE_EXISTING');
  });

  it('le même tableau en classeur Excel (vraies cellules) donne exactement le même rapport', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mesures');
    sheet.addRow(['Date', 'Heure', 'Glycémie', 'Unité', 'Contexte']);
    for (const r of csv.rows) {
      const [d, m, y] = r.date.split('/').map(Number) as [number, number, number];
      const [h, min] = (r.time ?? '').split(':').map(Number) as [number, number];
      const added = sheet.addRow([
        new Date(Date.UTC(y, m - 1, d)),
        new Date(Date.UTC(1899, 11, 30, h, min)),
        r.value,
        r.unit,
        r.context,
      ]);
      added.getCell(1).numFmt = 'dd/mm/yyyy';
      added.getCell(2).numFmt = 'hh:mm';
    }
    const xlsx = await parseXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const strip = (rows: ReturnType<typeof validateRows>['rows']) =>
      rows.map(({ rawValue: _raw, ...rest }) => rest);
    expect(strip(validateRows(xlsx, OPTIONS).rows)).toEqual(strip(validateRows(csv, OPTIONS).rows));
  });
});

describe('rejets (ERROR) : date, heure, valeur, unité, futur', () => {
  it.each([
    ['', 'DATE_MISSING'],
    ['31/02/2026', 'DATE_INVALID'],
    ['2026-13-01', 'DATE_INVALID'],
    ['00/10/2026', 'DATE_INVALID'],
    ['18/08/26', 'DATE_INVALID'],
    ['hier', 'DATE_INVALID'],
    ['46296', 'DATE_INVALID'],
    ['01/10/2026 25:00', 'DATE_INVALID'],
  ])('date « %s » ⇒ %s', (date, reason) => {
    expect(one({ date, time: undefined })).toMatchObject({ status: 'ERROR', reason });
  });

  it.each(['25:00', '07:60', '07:15:60', 'midi', '7.15', '0715'])(
    'heure « %s » ⇒ TIME_INVALID',
    (time) => {
      expect(one({ time })).toMatchObject({ status: 'ERROR', reason: 'TIME_INVALID' });
    },
  );

  it('valeur illisible ⇒ VALUE_INVALID ; unité inconnue ⇒ UNIT_UNKNOWN', () => {
    expect(one({ value: null, rawValue: 'abc' })).toEqual({
      line: 2,
      status: 'ERROR',
      reason: 'VALUE_INVALID',
      rawValue: 'abc',
      context: 'OTHER',
    });
    expect(one({ unit: 'kg' })).toMatchObject({ status: 'ERROR', reason: 'UNIT_UNKNOWN' });
  });

  it(`futur : jusqu'à ${FUTURE_TOLERANCE_MS / 60000} min de marge (horloge du lecteur), au-delà rejeté`, () => {
    // NOW = 10:00 UTC = 11:00 à Kinshasa.
    expect(one({ date: '12/10/2026', time: '11:05' }).status).toBe('VALID');
    expect(one({ date: '12/10/2026', time: '11:06' })).toMatchObject({
      status: 'ERROR',
      reason: 'DATE_FUTURE',
    });
    expect(one({ date: '13/10/2026', time: '00:00' }).reason).toBe('DATE_FUTURE');
    // Même heure locale, fuseau UTC-5 : 11:05 locale = 16:05 UTC ⇒ futur.
    expect(one({ date: '12/10/2026', time: '05:00' }, { timezoneOffsetMinutes: -300 }).status).toBe(
      'VALID',
    );
    expect(one({ date: '12/10/2026', time: '05:06' }, { timezoneOffsetMinutes: -300 }).reason).toBe(
      'DATE_FUTURE',
    );
  });

  it('une erreur passe avant une incohérence (futur ET hors bornes ⇒ ERROR)', () => {
    expect(one({ date: '01/01/2027', value: 18.7 })).toMatchObject({
      status: 'ERROR',
      reason: 'DATE_FUTURE',
    });
    expect(one({ date: 'x', value: 18.7, unit: 'mg/dL' }).reason).toBe('DATE_INVALID');
  });
});

describe('incohérences (INCONSISTENT) : à vérifier, jamais silencieuses', () => {
  it('bornes plausibles 20–600 mg/dL dans l’unité de la ligne ; unités proposées', () => {
    const at = (value: number, defaultUnit: ValidationOptions['defaultUnit']) =>
      one({ value }, { defaultUnit });
    expect(at(20, 'MG_DL').status).toBe('VALID');
    expect(at(600, 'MG_DL').status).toBe('VALID');
    expect(at(19.4, 'MG_DL')).toMatchObject({ status: 'INCONSISTENT', reason: 'OUT_OF_RANGE' });
    expect(at(600.5, 'MG_DL')).toMatchObject({ status: 'INCONSISTENT', valueMgDl: 601 });
    expect(at(5.5, 'MG_DL').suggestedUnits).toEqual(['G_L', 'MMOL_L']);
    expect(at(0.02, 'G_L').suggestedUnits).toEqual([]);
    expect(at(9.9, 'G_L').suggestedUnits).toEqual(['MMOL_L']);
    expect(at(110, 'MMOL_L').suggestedUnits).toEqual(['MG_DL']);
  });

  it('unité de la ligne différente de celle du fichier ⇒ UNIT_MISMATCH, valeur lue dans SON unité', () => {
    expect(one({ value: 110, unit: 'mg/dL' })).toMatchObject({
      status: 'INCONSISTENT',
      reason: 'UNIT_MISMATCH',
      valueMgDl: 110,
      originalUnit: 'MG_DL',
    });
    // Même unité, autre écriture : rien à signaler.
    expect(one({ unit: 'G/L' }).status).toBe('VALID');
    // Pas d'unité sur la ligne : celle du fichier.
    expect(one({ unit: undefined })).toMatchObject({ status: 'VALID', originalUnit: 'G_L' });
  });

  it('nombre de colonnes inattendu (ex. virgule décimale dans un fichier à virgules) ⇒ COLUMN_COUNT', () => {
    expect(one({ columnMismatch: true })).toMatchObject({
      status: 'INCONSISTENT',
      reason: 'COLUMN_COUNT',
    });
  });

  it('heure absente ⇒ TIME_MISSING, mesure placée à minuit (heure locale)', () => {
    expect(one({ time: undefined })).toMatchObject({
      status: 'INCONSISTENT',
      reason: 'TIME_MISSING',
      measuredAt: '2026-09-30T23:00:00.000Z',
    });
  });

  it('ordre des raisons : hors bornes > unité > colonnes > heure absente', () => {
    expect(one({ value: 18.7, unit: 'mg/dL', columnMismatch: true, time: undefined }).reason).toBe(
      'OUT_OF_RANGE',
    );
    expect(one({ value: 110, unit: 'mg/dL', columnMismatch: true, time: undefined }).reason).toBe(
      'UNIT_MISMATCH',
    );
    expect(one({ columnMismatch: true, time: undefined }).reason).toBe('COLUMN_COUNT');
  });
});

describe('doublons (DUPLICATE) : même minute, même valeur', () => {
  it('dans le fichier : la 1re occurrence reste valide, les suivantes sont doublons', () => {
    const report = validateRows(
      table(
        row({}, 2),
        row({ time: '07:15:40' }, 3), // même minute
        row({ value: 1.2 }, 4), // autre valeur
        row({ time: '07:16' }, 5), // autre minute
        row({}, 6),
      ),
      OPTIONS,
    );
    expect(report.rows.map((r) => [r.line, r.status, r.reason])).toEqual([
      [2, 'VALID', undefined],
      [3, 'DUPLICATE', 'DUPLICATE_IN_FILE'],
      [4, 'VALID', undefined],
      [5, 'VALID', undefined],
      [6, 'DUPLICATE', 'DUPLICATE_IN_FILE'],
    ]);
  });

  it('même valeur écrite autrement (1,10 g/L et 110 mg/dL) ⇒ même mesure', () => {
    const report = validateRows(
      table(row({ value: 1.1 }, 2), row({ value: 110, unit: 'mg/dL' }, 3)),
      { ...OPTIONS, defaultUnit: 'MG_DL' },
    );
    // Ligne 2 : 1,1 dans l'unité du fichier (mg/dL) ⇒ hors bornes ; ligne 3 : 110 mg/dL, valide.
    expect(report.rows.map((r) => r.status)).toEqual(['INCONSISTENT', 'VALID']);
    const same = validateRows(table(row({}, 2), row({ value: 110, unit: 'mg/dL' }, 3)), OPTIONS);
    // 1,1 g/L = 110 mg/dL : la ligne 3 est incohérente (unité) — l'incohérence passe avant le doublon.
    expect(same.rows.map((r) => [r.status, r.reason])).toEqual([
      ['VALID', undefined],
      ['INCONSISTENT', 'UNIT_MISMATCH'],
    ]);
  });

  it('une ligne rejetée ne compte pas ; une ligne incohérente compte comme 1re occurrence', () => {
    const report = validateRows(
      table(
        row({ unit: 'kg' }, 2), // ERROR : ne réserve pas la clé
        row({}, 3), // donc VALID
        row({ value: 110, unit: 'mg/dL', time: '08:00' }, 4), // INCONSISTENT, réserve sa clé
        row({ value: 1.1, time: '08:00' }, 5), // 1,1 g/L = 110 mg/dL, même minute ⇒ doublon
        row({ value: 110, unit: 'mg/dL', time: '08:00' }, 6), // reste INCONSISTENT
      ),
      OPTIONS,
    );
    expect(report.rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'ERROR'],
      [3, 'VALID'],
      [4, 'INCONSISTENT'],
      [5, 'DUPLICATE'],
      [6, 'INCONSISTENT'],
    ]);
    expect([report.valid, report.duplicates, report.inconsistent, report.errors]).toEqual([
      1, 1, 2, 1,
    ]);
  });

  it('déjà enregistrée (clé fournie par le service) : passe avant « en double dans le fichier »', () => {
    const measuredAt = new Date('2026-10-01T06:15:59.999Z'); // 07:15 à Kinshasa, secondes ignorées
    const existing = new Set([duplicateKey(measuredAt, 110)]);
    const report = validateRows(table(row({}, 2), row({}, 3)), { ...OPTIONS, existing });
    expect(report.rows.map((r) => r.reason)).toEqual(['DUPLICATE_EXISTING', 'DUPLICATE_EXISTING']);
    // Autre valeur à la même minute : pas un doublon.
    expect(validateRows(table(row({ value: 1.11 })), { ...OPTIONS, existing }).valid).toBe(1);
  });

  it('clé : à la minute près (UTC), valeur en mg/dL', () => {
    expect(duplicateKey(new Date('2026-10-01T06:15:00Z'), 110)).toBe(
      duplicateKey(new Date('2026-10-01T06:15:59.999Z'), 110),
    );
    expect(duplicateKey(new Date('2026-10-01T06:15:00Z'), 110)).not.toBe(
      duplicateKey(new Date('2026-10-01T06:16:00Z'), 110),
    );
    expect(duplicateKey(new Date('2026-10-01T06:15:00Z'), 110)).not.toBe(
      duplicateKey(new Date('2026-10-01T06:15:00Z'), 111),
    );
  });
});

describe('lecture des dates, heures, unités et contextes', () => {
  it.each([
    ['18/08/2026', [2026, 8, 18, null]],
    ['1/8/2026', [2026, 8, 1, null]],
    ['18-08-2026', [2026, 8, 18, null]],
    ['18.08.2026', [2026, 8, 18, null]],
    ['2026-08-18', [2026, 8, 18, null]],
    ['2026/8/18', [2026, 8, 18, null]],
    ['29/02/2028', [2028, 2, 29, null]],
    ['18/08/2026 07:15', [2026, 8, 18, { hour: 7, minute: 15, second: 0 }]],
    ['2026-08-18T07:15:30', [2026, 8, 18, { hour: 7, minute: 15, second: 30 }]],
    [' 2026-08-18  7h15 ', [2026, 8, 18, { hour: 7, minute: 15, second: 0 }]],
    ['18/08/2026  07:15', [2026, 8, 18, { hour: 7, minute: 15, second: 0 }]],
    ['18/08/2026T07:15', [2026, 8, 18, { hour: 7, minute: 15, second: 0 }]],
  ])('« %s »', (text, [year, month, day, time]) => {
    expect(parseDate(text)).toEqual({ year, month, day, time });
  });

  it.each([
    '29/02/2026',
    '31/04/2026',
    '32/01/2026',
    '01/00/2026',
    '18/08/0026', // l'an 26 : Date.UTC le lirait 1926
    '18/08/2026 abc',
    '2026-08-18T',
    '18/08/2026/1',
    'aaaa-mm-jj',
  ])('« %s » ⇒ illisible', (text) => {
    expect(parseDate(text)).toBeNull();
  });

  it('heures : « 07:15 », « 7h15 », « 7h », « 07:15:30 », bornes', () => {
    expect(parseTime('07:15')).toEqual({ hour: 7, minute: 15, second: 0 });
    expect(parseTime('7h15')).toEqual({ hour: 7, minute: 15, second: 0 });
    expect(parseTime('7H')).toEqual({ hour: 7, minute: 0, second: 0 });
    expect(parseTime('23:59:59')).toEqual({ hour: 23, minute: 59, second: 59 });
    expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('7:5')).toBeNull();
  });

  it('heure : la colonne « heure » passe avant l’heure écrite dans la date', () => {
    expect(one({ date: '01/10/2026 09:00', time: '07:15' }).measuredAt).toBe(
      '2026-10-01T06:15:00.000Z',
    );
    expect(one({ date: '01/10/2026 09:00', time: undefined })).toMatchObject({
      status: 'VALID',
      measuredAt: '2026-10-01T08:00:00.000Z',
    });
    // Les secondes sont gardées dans l'instant enregistré (seul le doublon compte à la minute).
    expect(one({ time: '07:15:30' }).measuredAt).toBe('2026-10-01T06:15:30.000Z');
  });

  it('unités : écritures courantes', () => {
    for (const t of ['g/L', 'g/l', 'G/L', 'gl', 'g / L', 'g/litre'])
      expect(parseUnit(t)).toBe('G_L');
    for (const t of ['mg/dL', 'mg/dl', 'MGDL', 'mg/100ml', 'mg / dL'])
      expect(parseUnit(t)).toBe('MG_DL');
    for (const t of ['mmol/L', 'mmol/l', 'mmol', 'mmol.l']) expect(parseUnit(t)).toBe('MMOL_L');
    for (const t of ['', 'kg', 'mg', 'g', 'mol/L']) expect(parseUnit(t)).toBeNull();
  });

  it.each([
    ['à jeun', 'FASTING'],
    ['A JEUN', 'FASTING'],
    ['au réveil', 'FASTING'],
    ['Fasting', 'FASTING'],
    ['avant repas', 'BEFORE_MEAL'],
    ['avant le déjeuner', 'BEFORE_MEAL'],
    ['before_meal', 'BEFORE_MEAL'],
    ['après repas', 'AFTER_MEAL'],
    ['après le dîner', 'AFTER_MEAL'],
    ['post-prandial', 'AFTER_MEAL'],
    ['postprandial', 'AFTER_MEAL'],
    ['au coucher', 'BEDTIME'],
    ['nuit', 'NIGHT'],
    ['réveil nocturne', 'NIGHT'],
    ['autre', 'OTHER'],
    ['sport', 'OTHER'],
    ['', 'OTHER'],
  ])('contexte « %s » ⇒ %s', (text, context) => {
    expect(parseContext(text)).toBe(context);
  });

  it('contexte absent ⇒ OTHER (jamais une erreur)', () => {
    expect(parseContext(undefined)).toBe('OTHER');
    expect(one({ context: undefined })).toMatchObject({ status: 'VALID', context: 'OTHER' });
  });

  it('chaque raison a un message en français', () => {
    for (const message of Object.values(REASON_MESSAGES)) expect(message.length).toBeGreaterThan(5);
  });
});
