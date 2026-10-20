// Mémorise le choix de langue sur le téléphone (Réglages → Langue).
// Stockage clé/valeur d'expo-sqlite, dans un fichier SÉPARÉ des données de santé (comme l'apparence) : la
// déconnexion ne change pas la langue. Version web : language-storage.web.ts.
import Storage from 'expo-sqlite/kv-store';

const KEY = 'glyka.language';

export function readLanguage(): string | null {
  try {
    return Storage.getItemSync(KEY);
  } catch {
    return null; // stockage indisponible : langue du téléphone
  }
}

export function writeLanguage(value: string): void {
  try {
    Storage.setItemSync(KEY, value);
  } catch {
    // préférence non sauvegardée : elle s'applique quand même jusqu'à la fermeture de l'application
  }
}
