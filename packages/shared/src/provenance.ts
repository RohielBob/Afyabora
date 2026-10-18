// Provenance d'une mesure (CDC F4 : « badge de provenance sur chaque mesure » ; L2-09, L4-09) : saisie à la
// main, importée (avec son lot : CA « un élément importé affiche son lot d'import ») ou venue d'un appareil.
// UNE seule règle, utilisée par le téléphone ET le portail du médecin : les deux affichent la même chose.
import type { MeasurementSource } from './enums';

export interface Provenance {
  source: MeasurementSource;
  /** Lot d'import en clair et court (« 3F2A1C »), seulement pour une mesure importée dont le lot est connu. */
  batch: string | null;
}

/** Lot d'import court (« 3F2A1C ») : assez pour le reconnaître, sans afficher l'identifiant entier. */
export function shortBatchId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function provenanceOf(
  source: MeasurementSource,
  importBatchId: string | null | undefined,
): Provenance {
  return {
    source,
    batch: source === 'IMPORT' && importBatchId ? shortBatchId(importBatchId) : null,
  };
}
