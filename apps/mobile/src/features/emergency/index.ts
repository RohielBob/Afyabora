// Point d'entrée public de la feature « emergency ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { emergencyApi } from './api';
export {
  BLOOD_GROUPS,
  EMPTY_DRAFT,
  LIMITS,
  cardProblem,
  draftFromCard,
  glucoseInput,
  glucoseMgDl,
  lastMeasurementSuggestion,
  previewLines,
  profileSuggestions,
  qrStatus,
  shouldGenerateQr,
  toInput,
  validateDraft,
  type BloodGroup,
  type CardDraft,
  type CardProblem,
  type DraftError,
  type DraftErrors,
  type PreviewLine,
  type ProfileFacts,
  type QrStatus,
} from './card';
export { clearStoredQr, parseStoredQr, readStoredQr, storeQr, type StoredQr } from './qr-storage';
export { QR_IMAGE_NAME, clearQrImages, shareQrImage } from './export-image';
export {
  inputOf,
  useEmergencyCard,
  type EmergencyAction,
  type EmergencyState,
} from './useEmergencyCard';
export {
  EmergencyQrImage,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  type EmergencyQrImageHandle,
} from './components/EmergencyQrImage';
export { CardPreview } from './components/CardPreview';
