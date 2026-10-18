// Chronologie du dossier partagé (L5-12) : mesures et évènements déclarés (repas, activité, traitement)
// mélangés dans UN seul ordre, du plus récent au plus ancien. Fonctions pures, testées sans base
// (test/doctor-timeline.test.ts).
//  - Ordre : date décroissante, puis identifiant décroissant (même règle que toutes les listes du projet,
//    common/data/owned-records.ts) : deux lignes à la même heure ne sont ni répétées ni oubliées d'une page
//    à l'autre, même si l'une est une mesure et l'autre un repas.
//  - Chaque table est lue avec `limit + 1` lignes après le curseur ; le mélange garde les `limit` premières.
//    S'il reste au moins une ligne, la page suivante commence après la dernière gardée.
import { classifyGlucose, type GlucoseThresholds, type TimelineItem } from '@glyka/shared';
import type { LifeEventType, MeasurementContext, MeasurementSource } from '@prisma/client';

/** Une ligne prête à être triée : sa position (date + identifiant) et ce que le médecin reçoit. */
export interface TimelineEntry {
  id: string;
  at: Date;
  item: TimelineItem;
}

/** Mesure ⇒ ligne : valeur, état selon les seuils DU PATIENT, provenance et lot ; le libellé est le contexte. */
export function measurementEntry(
  row: {
    id: string;
    measuredAt: Date;
    valueMgDl: number;
    context: MeasurementContext;
    source: MeasurementSource;
    importBatchId: string | null;
  },
  thresholds: GlucoseThresholds,
): TimelineEntry {
  return {
    id: row.id,
    at: row.measuredAt,
    item: {
      kind: 'MEASUREMENT',
      at: row.measuredAt.toISOString(),
      // Code du contexte (FASTING, AFTER_MEAL…) : le portail le traduit (aucun texte français ici).
      label: row.context,
      valueMgDl: row.valueMgDl,
      state: classifyGlucose(row.valueMgDl, thresholds),
      source: row.source,
      details: null,
      durationMinutes: null,
      importBatchId: row.importBatchId,
    },
  };
}

/**
 * Évènement déclaré ⇒ ligne : son libellé et sa durée, sans valeur ni provenance. `details` : texte libre
 * DÉJÀ déchiffré par l'appelant, ou null s'il ne doit pas être envoyé (notes personnelles non partagées).
 */
export function eventEntry(row: {
  id: string;
  occurredAt: Date;
  type: LifeEventType;
  label: string;
  durationMinutes: number | null;
  details: string | null;
}): TimelineEntry {
  return {
    id: row.id,
    at: row.occurredAt,
    item: {
      kind: row.type,
      at: row.occurredAt.toISOString(),
      label: row.label,
      valueMgDl: null,
      state: null,
      source: null,
      details: row.details,
      durationMinutes: row.durationMinutes,
      importBatchId: null,
    },
  };
}

/** Vrai si `a` vient AVANT `b` dans la chronologie (plus récent, ou même heure et identifiant plus grand). */
export function comesFirst(a: TimelineEntry, b: TimelineEntry): boolean {
  const diff = a.at.getTime() - b.at.getTime();
  return diff !== 0 ? diff > 0 : a.id > b.id;
}

/**
 * Mélange des listes DÉJÀ triées (chacune lue avec `limit + 1` lignes) : les `limit` premières lignes, et
 * la dernière gardée si une page suivante existe (sinon null).
 */
export function mergeTimeline(
  lists: TimelineEntry[][],
  limit: number,
): { page: TimelineEntry[]; last: TimelineEntry | null } {
  const all = lists.flat().sort((a, b) => (comesFirst(a, b) ? -1 : comesFirst(b, a) ? 1 : 0));
  const page = all.slice(0, limit);
  return { page, last: all.length > limit ? (page[page.length - 1] ?? null) : null };
}
