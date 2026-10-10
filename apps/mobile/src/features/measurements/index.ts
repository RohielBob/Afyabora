// Point d'entrée public de la feature « measurements ». Exporter ici uniquement ce que les autres features
// (et les écrans de app/) peuvent utiliser.
export {
  DECIMALS,
  FUTURE_TOLERANCE_MS,
  WHEN_PRESETS,
  convertText,
  formatClock,
  formatReading,
  formatTyped,
  initialWhen,
  isExactDuplicate,
  isInFuture,
  likelyUnits,
  otherUnits,
  parseValue,
  plausibleRange,
  resolveWhen,
  safetyLevel,
  shiftTime,
  toCreateInput,
  validateEntry,
  type DayOffset,
  type EntryDraft,
  type EntryErrors,
  type ParsedValue,
  type SafetyLevel,
  type ValueProblem,
  type WhenPreset,
  type WhenState,
} from './entry';
export { localMeasurements } from './local-store';
export { DEFAULT_UNIT, parseUnit, readUnit, writeUnit } from './unit-preference';
export { AddTabButton } from './components/AddTabButton';
export { SafetyNotice } from './components/SafetyNotice';
export { SavedState } from './components/SavedState';
export { UnusualValueCard } from './components/UnusualValueCard';
export { ValueField } from './components/ValueField';
export { WhenPicker } from './components/WhenPicker';
