// L'export JSON sur le téléphone (L1-14) : rangé dans un dossier du CACHE de l'application (`exports/`),
// puis confié au partage du système (Fichiers, Drive, e-mail…), comme le rapport PDF (L6-03).
//  - un seul export à la fois : le dossier est vidé avant d'écrire le nouveau ;
//  - le cache est privé à l'application et effacé à la déconnexion et à la suppression du compte
//    (clearExportFiles) : des données de santé en clair ne traînent pas sur le téléphone ;
//  - version navigateur (aperçu de développement) : files.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface SavedExport {
  uri: string;
  filename: string;
}

const folder = () => new Directory(Paths.cache, 'exports');

/** Écrit l'export dans le cache (le précédent est supprimé). */
export async function saveExport(bytes: Uint8Array, filename: string): Promise<SavedExport> {
  clearExportFiles();
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, filename);
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, filename };
}

/** Ouvre le partage du système ; false s'il n'existe pas sur cet appareil. */
export async function shareExport(saved: SavedExport, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(saved.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle,
  });
  return true;
}

/** Supprime les exports rangés (nouvel export, déconnexion, suppression du compte). Ne lève jamais d'erreur. */
export function clearExportFiles(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Dossier déjà parti ou illisible : rien à effacer.
  }
}
