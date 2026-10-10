// Point d'entrée public de la feature « measurements ». Exporter ici uniquement ce que les autres features
// (et les écrans de app/) peuvent utiliser.
export {
  DECIMALS,
  FUTURE_TOLERANCE_MS,
  WHEN_PRESETS,
  convertText,
  formatClock,
  initialWhen,
  isExactDuplicate,
  isInFuture,
  otherUnits,
  parseValue,
  resolveWhen,
  shiftTime,
  toCreateInput,
  validateEntry,
  type DayOffset,
  type EntryDraft,
  type EntryErrors,
  type ParsedValue,
  type ValueProblem,
  type WhenPreset,
  type WhenState,
} from './entry';
export { localMeasurements } from './local-store';
export { DEFAULT_UNIT, parseUnit, readUnit, writeUnit } from './unit-preference';
export { AddTabButton } from './components/AddTabButton';
export { SavedState } from './components/SavedState';
export { ValueField } from './components/ValueField';
export { WhenPicker } from './components/WhenPicker';
