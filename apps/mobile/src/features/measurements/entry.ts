// Saisie rapide d'une mesure (L2-03) : la LOGIQUE, sans interface (testée dans __tests__/entry.test.ts).
//  - lecture de la valeur tapée (virgule ou point), conversion en mg/dL avec les fonctions de @glyka/shared ;
//  - aperçu dans les deux autres unités (« 1,48 g/L = 148 mg/dL ») ;
//  - « Quand ? » : maintenant par défaut, raccourcis, ou jour + heure ;
//  - mêmes règles que le serveur : valeur > 0, date au plus 5 minutes dans le futur, bornes plausibles ;
//  - doublon exact (même minute, même valeur) : avertissement (CDC F2).
import {
  GLUCOSE_UNITS,
  formatGlucose,
  isPlausibleMgDl,
  parseDecimal,
  toMgDl,
  type CreateMeasurementInput,
  type GlucoseUnit,
  type MeasurementContext,
} from '@glyka/shared';

/** Même tolérance que l'API (5 minutes) : l'heure du téléphone est souvent un peu en avance. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Nombre maximal de décimales utiles par unité (au-delà, la saisie est sûrement une erreur de frappe). */
export const DECIMALS: Record<GlucoseUnit, number> = { G_L: 2, MMOL_L: 1, MG_DL: 0 };

export type ValueProblem = 'empty' | 'invalid' | 'zero' | 'decimals' | 'unusual';

export interface ParsedValue {
  /** Valeur dans l'unité saisie, ou null si illisible. */
  value: number | null;
  /** Valeur convertie en mg/dL entier, ou null. */
  mgDl: number | null;
  problem: ValueProblem | null;
}

/** Lit la saisie et dit ce qui ne va pas (clé i18n `measurement.problem.<problème>`). */
export function parseValue(text: string, unit: GlucoseUnit): ParsedValue {
  if (!text.trim()) return { value: null, mgDl: null, problem: 'empty' };
  const value = parseDecimal(text);
  if (value === null || !Number.isFinite(value))
    return { value: null, mgDl: null, problem: 'invalid' };
  if (value <= 0) return { value, mgDl: null, problem: 'zero' };
  const decimals = (text.trim().replace(',', '.').split('.')[1] ?? '').length;
  if (decimals > DECIMALS[unit]) return { value, mgDl: null, problem: 'decimals' };
  const mgDl = toMgDl(value, unit);
  // Hors 20–600 mg/dL : à vérifier ; la confirmation explicite arrive avec L2-04.
  if (!isPlausibleMgDl(mgDl)) return { value, mgDl, problem: 'unusual' };
  return { value, mgDl, problem: null };
}

/**
 * Changement d'unité : la valeur saisie est CONVERTIE (CDC F2 : « saisir 1,48 g/L puis passer en mg/dL
 * affiche 148 mg/dL »). Saisie vide ou illisible : laissée telle quelle.
 */
export function convertText(text: string, from: GlucoseUnit, to: GlucoseUnit): string {
  if (from === to) return text;
  const { value } = parseValue(text, from);
  if (value === null || value <= 0) return text;
  return formatGlucose(toMgDl(value, from), to, false);
}

/** Les deux autres unités, pour l'aperçu sous la valeur. */
export function otherUnits(unit: GlucoseUnit): GlucoseUnit[] {
  return GLUCOSE_UNITS.filter((u) => u !== unit);
}

// ---------- Quand ? ----------

export type WhenPreset = 'now' | 'minus30' | 'minus60' | 'custom';
export const WHEN_PRESETS: readonly WhenPreset[] = ['now', 'minus30', 'minus60', 'custom'];

/** Jour choisi en mode « Autre » : aujourd'hui, hier, avant-hier. */
export type DayOffset = 0 | 1 | 2;

export interface WhenState {
  preset: WhenPreset;
  /** Mode « Autre » : jour (0 = aujourd'hui) et heure locale. */
  day: DayOffset;
  hour: number;
  minute: number;
}

/** État initial : « maintenant » ; le mode « Autre » démarre sur l'heure actuelle arrondie à 5 min. */
export function initialWhen(now: Date): WhenState {
  return {
    preset: 'now',
    day: 0,
    hour: now.getHours(),
    minute: Math.floor(now.getMinutes() / 5) * 5,
  };
}

/** Date de la mesure selon le choix. Les secondes sont mises à zéro (une mesure se note à la minute). */
export function resolveWhen(when: WhenState, now: Date): Date {
  const date = new Date(now);
  date.setSeconds(0, 0);
  switch (when.preset) {
    case 'now':
      return date;
    case 'minus30':
      return new Date(date.getTime() - 30 * 60 * 1000);
    case 'minus60':
      return new Date(date.getTime() - 60 * 60 * 1000);
    case 'custom': {
      const custom = new Date(date);
      custom.setDate(custom.getDate() - when.day);
      custom.setHours(when.hour, when.minute, 0, 0);
      return custom;
    }
  }
}

/** Avance ou recule l'heure du mode « Autre » (pas de 1 h ou de 5 min, avec tour d'horloge). */
export function shiftTime(when: WhenState, deltaMinutes: number): WhenState {
  const total = (((when.hour * 60 + when.minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { ...when, hour: Math.floor(total / 60), minute: total % 60 };
}

/** Date plus de 5 minutes dans le futur (ex. « aujourd'hui, 23:00 » saisi à 9 h) ? */
export function isInFuture(date: Date, now: Date): boolean {
  return date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS;
}

/** « 08:05 » */
export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// ---------- Enregistrement ----------

export interface EntryDraft {
  text: string;
  unit: GlucoseUnit;
  when: WhenState;
  context: MeasurementContext | null;
  note: string;
}

export type EntryErrors = Partial<Record<'value' | 'when' | 'context', string>>; // valeur = clé i18n

/** Vérifie tout le formulaire (clés i18n). Le contexte est obligatoire : il donne son sens à la mesure. */
export function validateEntry(draft: EntryDraft, now: Date): EntryErrors {
  const errors: EntryErrors = {};
  const parsed = parseValue(draft.text, draft.unit);
  if (parsed.problem) errors.value = `measurement.problem.${parsed.problem}`;
  if (isInFuture(resolveWhen(draft.when, now), now)) errors.when = 'measurement.problem.future';
  if (!draft.context) errors.context = 'measurement.problem.context';
  return errors;
}

/** Données à écrire sur le téléphone (sans identifiant : il est généré par le dépôt local). */
export function toCreateInput(draft: EntryDraft, now: Date): Omit<CreateMeasurementInput, 'id'> {
  const parsed = parseValue(draft.text, draft.unit);
  if (parsed.value === null || !draft.context) throw new Error('Saisie incomplète');
  const note = draft.note.trim();
  return {
    value: parsed.value,
    unit: draft.unit,
    measuredAt: resolveWhen(draft.when, now).toISOString(),
    context: draft.context,
    ...(note ? { note } : {}),
    confirmedUnusual: false,
  };
}

/** Doublon exact : une mesure existante à la même minute avec la même valeur en mg/dL. */
export function isExactDuplicate(
  candidate: { mgDl: number; measuredAt: string },
  existing: readonly { valueMgDl: number; measuredAt: string }[],
): boolean {
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);
  return existing.some(
    (m) => m.valueMgDl === candidate.mgDl && minute(m.measuredAt) === minute(candidate.measuredAt),
  );
}
