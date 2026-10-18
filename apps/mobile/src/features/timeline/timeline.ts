// Chronologie (L2-09, CDC F4) : la LOGIQUE, sans interface (testée dans __tests__/timeline.test.ts).
//  - mesures et événements (repas, activité, traitement déclaré) réunis en une seule liste ;
//  - filtres : tout, glycémie, repas, activité, traitements, alertes ;
//  - groupés par jour du CALENDRIER, du plus récent au plus ancien (CA du cahier des charges) ;
//  - chargés par fenêtres de 30 jours (« Voir les 30 jours précédents »), pour rester rapides.
// Alertes : les alertes du moteur (F6, lot L3) n'existent pas encore ; en attendant, le filtre « Alertes »
// montre les mesures très basses ou très hautes selon les seuils du patient (celles qui ont déjà un
// message de sécurité à la saisie, L2-04).
import {
  classifyGlucose,
  type GlucoseThresholds,
  type LifeEventType,
  type MeasurementContext,
  type MeasurementSource,
} from '@glyka/shared';
import type { LocalEvent } from '@/features/events';
import type { LocalMeasurement } from '@/features/measurements';

export type TimelineItem =
  | {
      kind: 'measurement';
      id: string;
      /** Instant (ms depuis epoch). */
      at: number;
      mgDl: number;
      context: MeasurementContext;
      source: MeasurementSource;
      importBatchId: string | null;
      note: string | null;
      pendingSync: boolean;
    }
  | {
      kind: 'event';
      id: string;
      at: number;
      type: LifeEventType;
      label: string;
      details: string | null;
      durationMinutes: number | null;
      pendingSync: boolean;
    };

export function fromMeasurement(row: LocalMeasurement): TimelineItem {
  return {
    kind: 'measurement',
    id: row.id,
    at: Date.parse(row.measured_at),
    mgDl: row.value_mgdl,
    context: row.context,
    source: row.source,
    importBatchId: row.import_batch_id,
    note: row.note,
    pendingSync: row.pending_sync === 1,
  };
}

export function fromEvent(row: LocalEvent): TimelineItem {
  return {
    kind: 'event',
    id: row.id,
    at: Date.parse(row.occurred_at),
    type: row.type,
    label: row.label,
    details: row.details,
    durationMinutes: row.duration_minutes,
    pendingSync: row.pending_sync === 1,
  };
}

export const TIMELINE_FILTERS = [
  'all',
  'glucose',
  'MEAL',
  'ACTIVITY',
  'TREATMENT',
  'alerts',
] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

/** Mesure très basse ou très haute (en attendant les alertes du moteur, F6). */
export function isAlert(item: TimelineItem, thresholds: GlucoseThresholds): boolean {
  if (item.kind !== 'measurement') return false;
  const state = classifyGlucose(item.mgDl, thresholds);
  return state === 'VERY_LOW' || state === 'VERY_HIGH';
}

export function matchesFilter(
  item: TimelineItem,
  filter: TimelineFilter,
  thresholds: GlucoseThresholds,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'glucose':
      return item.kind === 'measurement';
    case 'alerts':
      return isAlert(item, thresholds);
    default:
      return item.kind === 'event' && item.type === filter;
  }
}

export interface DaySection {
  /** « 2026-10-10 » (jour local) : clé stable de la section. */
  key: string;
  /** Minuit local du jour (ms). */
  day: number;
  items: TimelineItem[];
}

function localMidnight(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sections par jour du calendrier local, du plus récent au plus ancien ; dans un jour, du plus récent au
 * plus ancien. À instant égal, la mesure passe avant l'événement (ordre stable, pas de « saut »).
 */
export function groupByDay(items: readonly TimelineItem[]): DaySection[] {
  const sorted = [...items].sort(
    (a, b) =>
      b.at - a.at ||
      (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'measurement' ? -1 : 1),
  );
  const sections: DaySection[] = [];
  for (const item of sorted) {
    const key = dayKey(item.at);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.items.push(item);
    else sections.push({ key, day: localMidnight(item.at), items: [item] });
  }
  return sections;
}

/** Taille d'une fenêtre de chargement, en jours. */
export const PAGE_DAYS = 30;

/**
 * Fenêtre des `pages` × 30 derniers jours (aujourd'hui compris), en ISO UTC pour la base locale :
 * début = minuit local il y a (30 × pages − 1) jours ; fin = demain minuit (rien n'est oublié aujourd'hui).
 */
export function windowBounds(pages: number, now: Date): { fromIso: string; toIso: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (PAGE_DAYS * pages - 1));
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Lot d'import court (« 3F2A1C ») : la règle est dans @glyka/shared, commune au portail (L4-09). */
export { shortBatchId } from '@glyka/shared';
