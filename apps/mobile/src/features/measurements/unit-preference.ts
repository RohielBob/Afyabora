// Unité préférée pour la saisie (L2-03) : celle du profil (assistant L1-08), puis la dernière utilisée.
// Stockage clé/valeur d'expo-sqlite, dans un fichier SÉPARÉ des données de santé (comme l'apparence) :
// c'est une préférence d'affichage, pas une donnée médicale. Version web : unit-preference.web.ts.
import Storage from 'expo-sqlite/kv-store';
import { GLUCOSE_UNITS, type GlucoseUnit } from '@glyka/shared';

const KEY = 'glyka.unit';
/** Unité par défaut du cahier des charges (F1) : g/L. */
export const DEFAULT_UNIT: GlucoseUnit = 'G_L';

export function parseUnit(raw: string | null): GlucoseUnit {
  return (GLUCOSE_UNITS as readonly string[]).includes(raw ?? '')
    ? (raw as GlucoseUnit)
    : DEFAULT_UNIT;
}

export function readUnit(): GlucoseUnit {
  try {
    return parseUnit(Storage.getItemSync(KEY));
  } catch {
    return DEFAULT_UNIT;
  }
}

export function writeUnit(unit: GlucoseUnit): void {
  try {
    Storage.setItemSync(KEY, unit);
  } catch {
    // préférence non sauvegardée : sans gravité
  }
}
