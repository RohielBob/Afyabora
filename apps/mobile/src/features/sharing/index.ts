// Point d'entrée public de la feature « sharing ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { sharingApi } from './api';
export {
  CATEGORY_ICONS,
  DEFAULT_SHARE_CATEGORIES,
  DEFAULT_SHARE_DURATION,
  SENSITIVE_CATEGORIES,
  SHARE_CATEGORY_ORDER,
  SHARE_DURATION_ORDER,
  buildShareInput,
  createProblem,
  toggleCategory,
  type CreateProblem,
} from './choice';
export { shareFlow, useShareFlow } from './flow';
export {
  ROTATE_BEFORE_END_MS,
  ROTATION_PERIOD_MS,
  TOKEN_LIFE_MS,
  createQrRotator,
  isTokenAlive,
  renewOutcome,
  retryDelayMs,
  rotationProgress,
  secondsToNext,
  type QrRotator,
  type RenewProblem,
  type RotationPhase,
  type RotationState,
} from './rotation';
export { useRotatingQr, type RotatingQr as RotatingQrState } from './useRotatingQr';
export { RotatingQr } from './components/RotatingQr';
export {
  ACTIVE_POLL_MS,
  WAITING_POLL_MS,
  createShareWatcher,
  formatRemaining,
  remainingSeconds,
  viewOf,
  type ShareView,
  type ShareWatcher,
  type WatchState,
} from './watch';
export { useShareWatch, type ShareWatch } from './useShareWatch';
export { LiveAccessCard } from './components/LiveAccessCard';
export { CategoryOption } from './components/CategoryOption';
export {
  buildVisits,
  formatMinutes,
  visitMinutes,
  type EmergencyVisit,
  type ShareVisit,
  type Visit,
} from './log';
export { VisitCard } from './components/VisitCard';
