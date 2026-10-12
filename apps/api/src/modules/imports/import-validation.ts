// Règles de validation de l'import (L4-03, CDC F5 « Règles de validation »). Fonctions PURES : les lignes
// lues (CSV ou Excel, `import-table.ts`) ⇒ un statut par ligne, avec la mesure prête à enregistrer.
//
// Statuts (contrat : IMPORT_ROW_STATUSES de @glyka/shared), dans cet ordre de priorité :
//  - ERROR (rejet) : date manquante ou illisible, heure illisible, valeur non numérique, unité inconnue,
//    date future ;
//  - INCONSISTENT (à vérifier par le patient) : valeur hors des bornes plausibles (20–600 mg/dL) dans son
//    unité, unité de la ligne différente de l'unité du fichier, nombre de colonnes inattendu (séparateur
//    à vérifier), heure absente ;
//  - DUPLICATE : même horodatage (à la minute) et même valeur qu'une mesure déjà enregistrée OU qu'une
//    ligne plus haut dans le fichier (la première occurrence garde son statut, les suivantes sont doublons) ;
//  - VALID : tout le reste.
//
// Rien n'est écrit ici : la base n'est touchée qu'au « commit » (L4-04). Les mesures déjà enregistrées
// arrivent sous forme de clés (`duplicateKey`), calculées par le service.
//
// Heure LOCALE du patient : le fichier contient l'heure affichée sur son lecteur. Elle est convertie en
// UTC avec le décalage du profil (`timezoneOffsetMinutes`, Kinshasa : +60 ⇒ 07:15 locale = 06:15 UTC).
import {
  type GlucoseUnit,
  type ImportRowStatus,
  type MeasurementContext,
  GLUCOSE_UNITS,
  isPlausibleMgDl,
  toMgDl,
} from '@glyka/shared';
import type { ImportRow, ImportTable } from './import-table';

/** Raison précise d'un statut autre que VALID (le rapport en tire son message). */
export type ImportRowReason =
  | 'DATE_MISSING'
  | 'DATE_INVALID'
  | 'TIME_INVALID'
  | 'VALUE_INVALID'
  | 'UNIT_UNKNOWN'
  | 'DATE_FUTURE'
  | 'OUT_OF_RANGE'
  | 'UNIT_MISMATCH'
  | 'COLUMN_COUNT'
  | 'TIME_MISSING'
  | 'DUPLICATE_EXISTING'
  | 'DUPLICATE_IN_FILE';

/** Message du rapport pour chaque raison (CDC : « valeur inhabituelle, vérifier l'unité »). */
export const REASON_MESSAGES: Readonly<Record<ImportRowReason, string>> = {
  DATE_MISSING: 'Date manquante',
  DATE_INVALID: 'Date illisible (formats acceptés : jj/mm/aaaa ou aaaa-mm-jj)',
  TIME_INVALID: 'Heure illisible (format attendu : HH:MM)',
  VALUE_INVALID: 'Valeur non numérique',
  UNIT_UNKNOWN: 'Unité inconnue (g/L, mg/dL ou mmol/L)',
  DATE_FUTURE: 'Date dans le futur',
  OUT_OF_RANGE: "Valeur inhabituelle, vérifier l'unité",
  UNIT_MISMATCH: "Unité différente de celle choisie pour le fichier, vérifier l'unité",
  COLUMN_COUNT: 'Nombre de colonnes inattendu, vérifier le séparateur',
  TIME_MISSING: 'Heure absente : la mesure sera placée à minuit',
  DUPLICATE_EXISTING: 'Mesure déjà enregistrée (même date, même heure, même valeur)',
  DUPLICATE_IN_FILE: 'Ligne en double dans le fichier',
};

/** Une ligne après validation. Les champs de mesure sont absents seulement pour une ligne ERROR. */
export interface ValidatedRow {
  line: number;
  status: ImportRowStatus;
  /** Absente pour une ligne VALID. */
  reason?: ImportRowReason;
  /** Valeur telle qu'écrite dans le fichier (montrée dans le rapport). */
  rawValue: string;
  /** Instant de la mesure (UTC, suffixe Z). */
  measuredAt?: string;
  valueMgDl?: number;
  originalValue?: number;
  originalUnit?: GlucoseUnit;
  context: MeasurementContext;
  /** Valeur hors bornes : autres unités dans lesquelles ce nombre serait plausible (« C'était en mmol/L ? »). */
  suggestedUnits?: GlucoseUnit[];
}

export interface ValidationOptions {
  /** Unité choisie par le patient pour le fichier (utilisée quand la ligne n'en donne pas). */
  defaultUnit: GlucoseUnit;
  /** Décalage horaire du patient en minutes (UTC+1 ⇒ 60). */
  timezoneOffsetMinutes: number;
  /** Instant présent (au-delà, une mesure est « dans le futur »). */
  now: Date;
  /** Clés (`duplicateKey`) des mesures déjà enregistrées du patient, non supprimées. */
  existing: ReadonlySet<string>;
}

export interface ValidationSummary {
  analyzed: number;
  valid: number;
  duplicates: number;
  inconsistent: number;
  errors: number;
  rows: ValidatedRow[];
}

/** Marge pour l'horloge du lecteur ou du téléphone : jusqu'à 5 minutes « dans le futur », c'est accepté. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Clé de doublon : même minute (UTC) et même valeur en mg/dL. */
export function duplicateKey(measuredAt: Date, valueMgDl: number): string {
  return `${Math.floor(measuredAt.getTime() / MINUTE_MS)}|${valueMgDl}`;
}

/** Texte comparable : sans accents, minuscules, espaces simples. */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/** Unité écrite dans le fichier ⇒ unité connue (« g/L », « mg/dl », « mmol/l », « mmol »…), sinon null. */
export function parseUnit(text: string): GlucoseUnit | null {
  const compact = plain(text).replace(/[\s.]/g, '');
  if (['g/l', 'gl', 'g/litre'].includes(compact)) return 'G_L';
  if (['mg/dl', 'mgdl', 'mg/100ml'].includes(compact)) return 'MG_DL';
  if (['mmol/l', 'mmoll', 'mmol'].includes(compact)) return 'MMOL_L';
  return null;
}

/** Contexte écrit dans le fichier ⇒ contexte de mesure ; inconnu ou absent ⇒ OTHER (jamais une erreur). */
export function parseContext(text: string | undefined): MeasurementContext {
  const t = plain(text ?? '');
  // La nuit d'abord : « réveil nocturne » est une mesure de nuit, pas « à jeun au réveil ».
  if (/\b(nuit|night|nocturne)\b/.test(t)) return 'NIGHT';
  if (/\b(a jeun|jeun|fasting|au reveil|reveil)\b/.test(t)) return 'FASTING';
  if (/^(avant|before|pre)\b/.test(t)) return 'BEFORE_MEAL';
  if (/^(apres|after|post)\b|postprandial/.test(t)) return 'AFTER_MEAL';
  if (/\b(coucher|bedtime)\b/.test(t)) return 'BEDTIME';
  return 'OTHER';
}

interface LocalTime {
  hour: number;
  minute: number;
  second: number;
}

const TIME = /^(\d{1,2})(?:[:hH](\d{2})(?::(\d{2}))?|[hH])$/;

/** « 07:15 », « 7h15 », « 07:15:30 », « 7h » ⇒ heure locale ; illisible ou hors bornes ⇒ null. */
export function parseTime(text: string): LocalTime | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  const [hour, minute, second] = [match[1], match[2], match[3]].map((p) => Number(p ?? 0)) as [
    number,
    number,
    number,
  ];
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

const pad = (n: number) => String(n).padStart(2, '0');

const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T]+(.+))?$/;
const YMD = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(.+))?$/;

/**
 * Date du fichier ⇒ jour + heure éventuelle (« 18/08/2026 », « 2026-08-18 07:15 », « 18.08.2026 7h15 »).
 * Jour impossible (31/02) ou heure illisible ⇒ null. Lecture à la française : 03/04 = 3 avril.
 */
export function parseDate(
  text: string,
): { year: number; month: number; day: number; time: LocalTime | null } | null {
  const trimmed = text.trim();
  const dmy = DMY.exec(trimmed);
  const ymd = dmy ? null : YMD.exec(trimmed);
  const parts = dmy
    ? { day: dmy[1], month: dmy[2], year: dmy[3], rest: dmy[4] }
    : ymd
      ? { year: ymd[1], month: ymd[2], day: ymd[3], rest: ymd[4] }
      : null;
  if (!parts) return null;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Le jour doit exister : Date.UTC « corrige » sans rien dire 31/02 en 03/03 (et l'an 0026 en 1926).
  // On compare donc la date obtenue à celle écrite.
  const check = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (check !== `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`) return null;
  if (parts.rest === undefined) return { year, month, day, time: null };
  const time = parseTime(parts.rest);
  return time ? { year, month, day, time } : null;
}

/** Ligne lue ⇒ ligne validée (sans les doublons, décidés ensuite sur l'ensemble du fichier). */
function checkRow(row: ImportRow, options: ValidationOptions): ValidatedRow {
  const context = parseContext(row.context);
  const base = { line: row.line, rawValue: row.rawValue, context };
  const error = (reason: ImportRowReason): ValidatedRow => ({ ...base, status: 'ERROR', reason });

  if (row.date === '') return error('DATE_MISSING');
  const date = parseDate(row.date);
  if (!date) return error('DATE_INVALID');
  const time = row.time === undefined ? date.time : parseTime(row.time);
  if (row.time !== undefined && !time) return error('TIME_INVALID');
  if (row.value === null) return error('VALUE_INVALID');
  const rowUnit = row.unit === undefined ? null : parseUnit(row.unit);
  if (row.unit !== undefined && !rowUnit) return error('UNIT_UNKNOWN');

  const local = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time?.hour ?? 0,
    time?.minute ?? 0,
    time?.second ?? 0,
  );
  const measuredAt = new Date(local - options.timezoneOffsetMinutes * MINUTE_MS);
  if (measuredAt.getTime() > options.now.getTime() + FUTURE_TOLERANCE_MS) {
    return error('DATE_FUTURE');
  }

  const unit = rowUnit ?? options.defaultUnit;
  const valueMgDl = toMgDl(row.value, unit);
  const measure = {
    ...base,
    measuredAt: measuredAt.toISOString(),
    valueMgDl,
    originalValue: row.value,
    originalUnit: unit,
  };
  const inconsistent = (reason: ImportRowReason, extra: Partial<ValidatedRow> = {}) =>
    ({ ...measure, status: 'INCONSISTENT', reason, ...extra }) as ValidatedRow;

  if (!isPlausibleMgDl(valueMgDl)) {
    // L'unité de la ligne n'y figure jamais : dans cette unité, la valeur est justement hors bornes.
    const value = row.value;
    const suggestedUnits = GLUCOSE_UNITS.filter((other) => isPlausibleMgDl(toMgDl(value, other)));
    return inconsistent('OUT_OF_RANGE', { suggestedUnits });
  }
  if (rowUnit && rowUnit !== options.defaultUnit) return inconsistent('UNIT_MISMATCH');
  if (row.columnMismatch) return inconsistent('COLUMN_COUNT');
  if (!time) return inconsistent('TIME_MISSING');
  return { ...measure, status: 'VALID' };
}

/**
 * Valide toutes les lignes du fichier (CSV ou Excel). Les doublons sont cherchés parmi les mesures déjà
 * enregistrées (`options.existing`) et parmi les lignes PLUS HAUT dans le fichier ; une ligne rejetée
 * (ERROR) ne compte pas comme première occurrence.
 */
export function validateRows(table: ImportTable, options: ValidationOptions): ValidationSummary {
  const seen = new Set<string>();
  const rows = table.rows.map((row): ValidatedRow => {
    const checked = checkRow(row, options);
    // Ligne rejetée (ERROR) : pas de mesure, donc ni doublon ni première occurrence.
    if (!checked.measuredAt || checked.valueMgDl === undefined) return checked;
    const key = duplicateKey(new Date(checked.measuredAt), checked.valueMgDl);
    const inFile = seen.has(key);
    seen.add(key);
    if (checked.status !== 'VALID') return checked;
    if (options.existing.has(key))
      return { ...checked, status: 'DUPLICATE', reason: 'DUPLICATE_EXISTING' };
    if (inFile) return { ...checked, status: 'DUPLICATE', reason: 'DUPLICATE_IN_FILE' };
    return checked;
  });
  const count = (status: ImportRowStatus) => rows.filter((r) => r.status === status).length;
  return {
    analyzed: rows.length,
    valid: count('VALID'),
    duplicates: count('DUPLICATE'),
    inconsistent: count('INCONSISTENT'),
    errors: count('ERROR'),
    rows,
  };
}
