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
export { CategoryOption } from './components/CategoryOption';
