// Point d'entrée public de la feature « events ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export {
  DETAILS_MAX,
  DURATION_PRESETS,
  LABEL_MAX,
  LABEL_SUGGESTIONS,
  parseDuration,
  parseEventType,
  toCreateEventInput,
  validateEvent,
  type EventDraft,
  type EventErrors,
} from './entry';
export { localEvents, type LocalEvent } from './local-store';
export { EventSaved } from './components/EventSaved';
export { QuickChips } from './components/QuickChips';
export { EVENT_ICON, TypeTiles } from './components/TypeTiles';
