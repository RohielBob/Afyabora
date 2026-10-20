// Point d'entrée public de la feature « profile ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { profileApi, type PatientProfileResponse } from './api';
export {
  STEPS,
  SUGGESTED_COUNTRIES,
  THRESHOLD_KEYS,
  convertThresholds,
  countryCode,
  displayToMgDl,
  finalPayload,
  firstInvalidStep,
  initialDraft,
  maskBirthDate,
  validateStep,
  type CountryChoice,
  type ProfileDraft,
  type Step,
  type StepErrors,
  type ThresholdKey,
} from './wizard';
export { readThresholds, saveThresholds } from './local-thresholds';
export { StepProgress } from './components/StepProgress';
export { ThresholdBar } from './components/ThresholdBar';
export {
  ThresholdsEditor,
  UNIT_LABEL,
  defaultThresholdsIn,
  type ThresholdsValue,
} from './components/ThresholdsEditor';
export {
  checkUnitsDraft,
  draftFromProfile,
  draftMgDl,
  hasChanges,
  unitsProblem,
  type UnitsCheck,
  type UnitsDraft,
  type UnitsProblem,
} from './settings';
export { useUnitsSettings, type UnitsSettingsState } from './useUnitsSettings';
