// Saisie rapide d'une mesure (L2-03) : la LOGIQUE, sans interface (testée dans __tests__/entry.test.ts).
//  - lecture de la valeur tapée (virgule ou point), conversion en mg/dL avec les fonctions de @glyka/shared ;
//  - aperçu dans les deux autres unités (« 1,48 g/L = 148 mg/dL ») ;
//  - « Quand ? » : maintenant par défaut, raccourcis, ou jour + heure ;
//  - mêmes règles que le serveur : valeur > 0, date au plus 5 minutes dans le futur, bornes plausibles ;
//  - doublon exact (même minute, même valeur) : avertissement (CDC F2) ;
//  - valeur inhabituelle : confirmation explicite, avec l'unité probable si c'est une erreur d'unité (L2-04) ;
//  - valeur très basse ou très haute selon les seuils du patient : message de sécurité (L2-04).
import {
  GLUCOSE_UNITS,
  PLAUSIBLE_MAX_MG_DL,
  PLAUSIBLE_MIN_MG_DL,
  UNIT_LABELS,
  classifyGlucose,
  formatGlucose,
  isPlausibleMgDl,
  parseDecimal,
  toMgDl,
  type CreateMeasurementInput,
  type GlucoseThresholds,
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
  // Hors 20–600 mg/dL : la personne doit confirmer (L2-04) ; voir validateEntry et `confirmedUnusual`.
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

// ---------- Valeur inhabituelle et sécurité (L2-04) ----------

/**
 * Valeur inhabituelle : dans quelle(s) AUTRE(S) unité(s) le même nombre serait-il plausible ?
 * Sert à proposer « C'était en mmol/L ? » quand l'erreur vient sans doute de l'unité (18,7 g/L tapé au lieu
 * de 18,7 mmol/L). Le nombre est gardé tel quel : c'est l'unité qui change, pas la valeur (≠ convertText).
 * Liste vide si la valeur n'est pas inhabituelle, ou si aucune autre unité ne lui donne un sens.
 */
export function likelyUnits(text: string, unit: GlucoseUnit): GlucoseUnit[] {
  if (parseValue(text, unit).problem !== 'unusual') return [];
  return otherUnits(unit).filter((other) => parseValue(text, other).problem === null);
}

/** Plage plausible dans l'unité choisie, pour l'expliquer (« entre 0,20 et 6,00 g/L »). */
export function plausibleRange(unit: GlucoseUnit): { min: string; max: string } {
  return {
    min: formatReading(PLAUSIBLE_MIN_MG_DL, unit),
    max: formatReading(PLAUSIBLE_MAX_MG_DL, unit),
  };
}

/**
 * Valeur affichée dans les messages, avec séparateur des milliers à la française (espace fine insécable) :
 * « 1 870 mg/dL », « 18,70 g/L ».
 */
export function formatReading(mgDl: number, unit: GlucoseUnit): string {
  return formatGlucose(mgDl, unit).replace(/^\d{4,}/, (digits) =>
    digits.replace(/\B(?=(\d{3})+$)/g, '\u202F'),
  );
}

/**
 * La valeur TELLE QUE TAPÉE, pour la question « est-ce correct ? » : la personne doit relire ce qu'elle a
 * saisi (« 187 mmol/L »), pas une version arrondie par la conversion (« 187,0 mmol/L »). Virgule décimale
 * et milliers séparés : « 1870 » → « 1 870 mg/dL ».
 */
export function formatTyped(text: string, unit: GlucoseUnit): string {
  const [integer = '', decimals] = text.trim().replace('.', ',').split(',');
  const grouped = integer.replace(/\B(?=(\d{3})+$)/g, '\u202F');
  return `${decimals !== undefined ? `${grouped},${decimals}` : grouped} ${UNIT_LABELS[unit]}`;
}

/** Niveau qui déclenche le message de sécurité (CDC F2) : très bas ou très haut, sinon rien. */
export type SafetyLevel = 'VERY_LOW' | 'VERY_HIGH';

/**
 * La mesure franchit-elle le seuil « très bas » ou « très haut » du patient (ses seuils du profil,
 * à défaut ceux de @glyka/shared) ? Aucune consigne de traitement n'en découle : seulement un message sobre.
 */
export function safetyLevel(mgDl: number, thresholds: GlucoseThresholds): SafetyLevel | null {
  const state = classifyGlucose(mgDl, thresholds);
  return state === 'VERY_LOW' || state === 'VERY_HIGH' ? state : null;
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
  /**
   * La personne a répondu « oui, c'est correct » à la question sur la valeur inhabituelle (L2-04).
   * Remis à false dès que la valeur ou l'unité change : on ne confirme qu'une valeur précise.
   */
  confirmedUnusual: boolean;
}

export type EntryErrors = Partial<Record<'value' | 'when' | 'context', string>>; // valeur = clé i18n

/**
 * Vérifie tout le formulaire (clés i18n). Le contexte est obligatoire : il donne son sens à la mesure.
 * Une valeur inhabituelle n'est plus une erreur une fois confirmée (CDC F2 : « confirmation obligatoire »).
 */
export function validateEntry(draft: EntryDraft, now: Date): EntryErrors {
  const errors: EntryErrors = {};
  const parsed = parseValue(draft.text, draft.unit);
  const confirmed = parsed.problem === 'unusual' && draft.confirmedUnusual;
  if (parsed.problem && !confirmed) errors.value = `measurement.problem.${parsed.problem}`;
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
    // Vrai seulement si la valeur est RÉELLEMENT inhabituelle et confirmée : le serveur l'exige pour
    // l'accepter (sinon 422 UNUSUAL_VALUE, contrat 0.2.1) et l'indicateur garde la trace du choix.
    confirmedUnusual: parsed.problem === 'unusual' && draft.confirmedUnusual,
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
