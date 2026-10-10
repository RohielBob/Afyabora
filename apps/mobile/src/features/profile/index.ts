// Point d'entrée public de la feature « profile ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { profileApi, type PatientProfileResponse } from './api';
export {
  STEPS,
  THRESHOLD_KEYS,
  convertThresholds,
  displayToMgDl,
  finalPayload,
  firstInvalidStep,
  initialDraft,
  maskBirthDate,
  validateStep,
  type ProfileDraft,
  type Step,
  type StepErrors,
  type ThresholdKey,
} from './wizard';
export { StepProgress } from './components/StepProgress';
export { ThresholdBar } from './components/ThresholdBar';
