// Seuils du patient sur le téléphone (L2-04) : dans la base locale, table `kv`, avec les autres données du
// compte (effacées à la déconnexion). Une erreur de stockage ne bloque jamais l'interface : on retombe sur
// les seuils par défaut. Version web (aperçu, sans SQLite) : local-thresholds.web.ts.
import { DEFAULT_THRESHOLDS, type GlucoseThresholds } from '@glyka/shared';
import { readKv, writeKv } from '@/db/repositories/kv.repo';
import { THRESHOLDS_KEY, parseStoredThresholds } from './stored-thresholds';

export async function readThresholds(): Promise<GlucoseThresholds> {
  try {
    return parseStoredThresholds(await readKv(THRESHOLDS_KEY));
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export async function saveThresholds(thresholds: GlucoseThresholds): Promise<void> {
  try {
    await writeKv(THRESHOLDS_KEY, JSON.stringify(thresholds));
  } catch {
    // seuils non gardés : la saisie utilisera les seuils par défaut, sans gravité
  }
}
