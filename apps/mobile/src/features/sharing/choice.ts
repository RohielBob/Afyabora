// Choix de ce qui est partagé et pendant combien de temps (L5-06, CDC F7 étapes 2 et 3). Fonctions pures,
// testées sans écran (__tests__/choice.test.ts).
//  - Le patient choisit les CATÉGORIES : seules celles-ci seront visibles par le médecin (filtre côté
//    serveur, L5-12). Par défaut, l'essentiel du suivi est coché ; les NOTES PERSONNELLES sont décochées
//    (CDC F7), comme le TÉLÉCHARGEMENT DU RAPPORT (le médecin voit déjà les données ; emporter un PDF est
//    un pas de plus, que le patient choisit lui-même).
//  - Puis la DURÉE de l'accès, qui démarre au scan : 5 min, 30 min, 1 h, ou « consultation » (2 h au plus,
//    le patient peut y mettre fin avant).
//  - Les erreurs du serveur deviennent un « problème » que l'écran sait expliquer.
import { type CreateShareInput, type ShareCategory, type ShareDuration } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

/** Ordre d'affichage : du plus utile au médecin au plus personnel. */
export const SHARE_CATEGORY_ORDER: readonly ShareCategory[] = [
  'GLUCOSE_HISTORY',
  'TREATMENTS',
  'MEALS',
  'ACTIVITY',
  'AI_SUMMARY',
  'REPORT_DOWNLOAD',
  'PERSONAL_NOTES',
];

/** Cochées à l'ouverture de l'écran (notes personnelles et rapport : décochés). */
export const DEFAULT_SHARE_CATEGORIES: readonly ShareCategory[] = [
  'GLUCOSE_HISTORY',
  'TREATMENTS',
  'MEALS',
  'ACTIVITY',
  'AI_SUMMARY',
];

/** Catégories qui méritent un mot d'avertissement quand on les coche (plus personnelles). */
export const SENSITIVE_CATEGORIES: readonly ShareCategory[] = ['PERSONAL_NOTES'];

export const SHARE_DURATION_ORDER: readonly ShareDuration[] = [
  'MIN_5',
  'MIN_30',
  'HOUR_1',
  'CONSULTATION',
];

/** Durée proposée à l'ouverture : assez pour une consultation courte, sans laisser l'accès ouvert trop longtemps. */
export const DEFAULT_SHARE_DURATION: ShareDuration = 'MIN_30';

/** Icône (Ionicons) de chaque catégorie : l'état coché reste dit par la case et son libellé, jamais par l'icône seule. */
export const CATEGORY_ICONS: Record<ShareCategory, string> = {
  GLUCOSE_HISTORY: 'water-outline',
  TREATMENTS: 'medkit-outline',
  MEALS: 'restaurant-outline',
  ACTIVITY: 'walk-outline',
  AI_SUMMARY: 'sparkles-outline',
  REPORT_DOWNLOAD: 'document-text-outline',
  PERSONAL_NOTES: 'lock-closed-outline',
};

/** Coche ou décoche une catégorie ; le résultat garde l'ordre d'affichage (sans doublon). */
export function toggleCategory(
  selected: readonly ShareCategory[],
  category: ShareCategory,
): ShareCategory[] {
  const next = new Set(selected);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return SHARE_CATEGORY_ORDER.filter((c) => next.has(c));
}

/** Corps de POST /shares, ou `null` si rien n'est coché (le bouton reste inactif). */
export function buildShareInput(
  selected: readonly ShareCategory[],
  duration: ShareDuration,
): CreateShareInput | null {
  const categories = SHARE_CATEGORY_ORDER.filter((c) => selected.includes(c));
  if (categories.length === 0) return null;
  return { categories, duration };
}

export type CreateProblem =
  | { kind: 'offline' }
  /** Le serveur explique quoi faire (ex. compléter le profil médical). */
  | { kind: 'rejected'; detail: string }
  | { kind: 'tooMany' }
  | { kind: 'busy' }
  | { kind: 'error' };

/** Échec de POST /shares ⇒ problème à expliquer au patient. */
export function createProblem(error: unknown): CreateProblem {
  if (!(error instanceof ApiError)) return { kind: 'error' };
  if (error.status === 0) return { kind: 'offline' };
  if (error.status === 429) return { kind: 'tooMany' };
  if (error.status === 503) return { kind: 'busy' };
  // 400 sans champ fautif : refus métier expliqué par le serveur (profil médical à compléter).
  if (error.status === 400 && error.issues.length === 0 && error.message) {
    return { kind: 'rejected', detail: error.message };
  }
  return { kind: 'error' };
}
