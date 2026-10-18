// Point d'entrée public de la feature « timeline ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export {
  PAGE_DAYS,
  TIMELINE_FILTERS,
  fromEvent,
  fromMeasurement,
  groupByDay,
  isAlert,
  matchesFilter,
  shortBatchId,
  windowBounds,
  type DaySection,
  type TimelineFilter,
  type TimelineItem,
} from './timeline';
export { useTimeline, type TimelineState } from './useTimeline';
export { FilterChips } from './components/FilterChips';
export { ProvenanceBadge, provenanceText } from './components/ProvenanceBadge';
export { TimelineRow } from './components/TimelineRow';
