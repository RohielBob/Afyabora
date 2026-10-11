// Modifier ou supprimer une mesure (L2-11, CDC F2) : la LOGIQUE, sans interface (testée dans
// __tests__/edit.test.ts).
//  - le formulaire part de la mesure telle qu'elle a été saisie (valeur et unité d'ORIGINE) ;
//  - la date se règle à partir de la date d'origine (jour précédent / suivant, heure par pas de 5 min ou
//    1 h), jamais dans le futur — le « Quand ? » de la saisie ne remonte qu'à avant-hier ;
//  - seuls les champs CHANGÉS partent dans la modification ; rien de changé = rien à écrire ;
//  - mêmes règles qu'à la saisie (valeur lisible, décimales, bornes plausibles avec confirmation).
import type { GlucoseUnit, MeasurementContext, UpdateMeasurementInput } from '@glyka/shared';
import type { LocalMeasurement } from './local-store';
import { isInFuture, parseValue } from './entry';

export interface EditDraft {
  text: string;
  unit: GlucoseUnit;
  /** Date et heure de la mesure (à la minute). */
  at: Date;
  context: MeasurementContext;
  note: string;
  /** La personne a confirmé une valeur inhabituelle (L2-04). */
  confirmedUnusual: boolean;
}

export type EditErrors = Partial<Record<'value' | 'when', string>>;

/** Nombre tel qu'il a été saisi, avec virgule (« 1,48 », « 148 »). */
export function originalText(value: number): string {
  return `${value}`.replace('.', ',');
}

/** Brouillon de départ : la mesure telle qu'elle est gardée sur le téléphone. */
export function draftFromMeasurement(row: LocalMeasurement): EditDraft {
  return {
    text: originalText(row.original_value),
    unit: row.original_unit,
    at: new Date(row.measured_at),
    context: row.context,
    note: row.note ?? '',
    confirmedUnusual: row.confirmed_unusual === 1,
  };
}

/** Décale la date de `minutes` (pas de 5 min ou 1 h) ; secondes à zéro. */
export function shiftMinutes(at: Date, minutes: number): Date {
  const next = new Date(at.getTime() + minutes * 60_000);
  next.setSeconds(0, 0);
  return next;
}

/** Décale la date d'un nombre de jours du CALENDRIER (même heure, robuste aux changements d'heure). */
export function shiftDays(at: Date, days: number): Date {
  const next = new Date(at);
  next.setDate(next.getDate() + days);
  return next;
}

/** Le jour suivant serait-il dans le futur ? (pour désactiver le bouton « jour suivant »). */
export function canGoForward(at: Date, minutes: number, now: Date): boolean {
  return !isInFuture(shiftMinutes(at, minutes), now);
}

export function validateEdit(draft: EditDraft, now: Date): EditErrors {
  const errors: EditErrors = {};
  const parsed = parseValue(draft.text, draft.unit);
  const confirmed = parsed.problem === 'unusual' && draft.confirmedUnusual;
  if (parsed.problem && !confirmed) errors.value = `measurement.problem.${parsed.problem}`;
  if (isInFuture(draft.at, now)) errors.when = 'measurement.problem.future';
  return errors;
}

/**
 * Modification à envoyer : SEULEMENT ce qui a changé (null si rien). Valeur et unité vont toujours
 * ensemble (règle du schéma partagé). Une note vidée est envoyée comme « » (le dépôt l'efface).
 */
export function toUpdatePatch(
  row: LocalMeasurement,
  draft: EditDraft,
): UpdateMeasurementInput | null {
  const parsed = parseValue(draft.text, draft.unit);
  if (parsed.value === null) throw new Error('Valeur illisible');
  const patch: UpdateMeasurementInput = {};
  if (parsed.value !== row.original_value || draft.unit !== row.original_unit) {
    patch.value = parsed.value;
    patch.unit = draft.unit;
    // Nouvelle valeur inhabituelle : la confirmation donnée à l'écran l'accompagne.
    if (parsed.problem === 'unusual') patch.confirmedUnusual = draft.confirmedUnusual;
  }
  const at = draft.at.toISOString();
  if (at !== new Date(row.measured_at).toISOString()) patch.measuredAt = at;
  if (draft.context !== row.context) patch.context = draft.context;
  const note = draft.note.trim();
  if (note !== (row.note ?? '')) patch.note = note;
  return Object.keys(patch).length ? patch : null;
}
