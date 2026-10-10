// Seuils du patient gardés sur le téléphone (L2-04) : la LOGIQUE, sans stockage (testée à part).
// La saisie d'une mesure en a besoin HORS-LIGNE pour savoir si la valeur est très basse ou très haute
// (message de sécurité, CDC F2). Ils sont écrits à l'enregistrement du profil (assistant L1-08).
import { DEFAULT_THRESHOLDS, thresholdsSchema, type GlucoseThresholds } from '@glyka/shared';

/** Clé dans la table `kv` de la base locale (vidée à la déconnexion). */
export const THRESHOLDS_KEY = 'profile.thresholds';

/**
 * Relit les seuils enregistrés. Absents, illisibles ou incohérents (ordre très bas < cible < très haut
 * non respecté) : seuils par défaut de @glyka/shared, pour que le message de sécurité marche toujours.
 */
export function parseStoredThresholds(raw: string | null): GlucoseThresholds {
  if (!raw) return DEFAULT_THRESHOLDS;
  try {
    const result = thresholdsSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}
