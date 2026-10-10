// Mémorise le choix d'apparence (thème + couleur d'accent) sur le téléphone.
// Stockage clé/valeur d'expo-sqlite, dans un fichier SÉPARÉ de la base de données de santé (glyka.db) :
// vider les données à la déconnexion (ADR-0004) ne réinitialise pas les préférences d'affichage.
// Version web : storage.web.ts (Metro choisit automatiquement le bon fichier selon la plateforme).
import Storage from 'expo-sqlite/kv-store';

const KEY = 'glyka.appearance';

export function readAppearance(): string | null {
  try {
    return Storage.getItemSync(KEY);
  } catch {
    return null; // stockage indisponible : on garde l'apparence par défaut
  }
}

export function writeAppearance(value: string): void {
  try {
    Storage.setItemSync(KEY, value);
  } catch {
    // préférence non sauvegardée : sans gravité, elle s'applique quand même pour la session
  }
}
