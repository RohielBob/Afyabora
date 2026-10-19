// Le PDF sur le téléphone (L6-03) : rangé dans un dossier du CACHE de l'application (`rapports/`), puis
// confié au partage du système (expo-sharing : WhatsApp, e-mail, Fichiers, imprimer…).
//  - un seul rapport à la fois : le dossier est vidé avant d'écrire le nouveau ;
//  - le cache est privé à l'application et effacé à la déconnexion (clearReportFiles) : un rapport de
//    santé ne traîne pas sur le téléphone ;
//  - version navigateur (aperçu de développement) : files.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Un rapport rangé sur le téléphone. */
export interface SavedReport {
  uri: string;
  filename: string;
}

const folder = () => new Directory(Paths.cache, 'rapports');

/** Écrit le PDF dans le cache (le précédent est supprimé). */
export async function saveReport(bytes: Uint8Array, filename: string): Promise<SavedReport> {
  clearReportFiles();
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, filename);
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, filename };
}

/** Ouvre le partage du système ; false s'il n'existe pas sur cet appareil. */
export async function shareReport(saved: SavedReport, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(saved.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
  return true;
}

/** Supprime les rapports rangés (nouveau rapport, déconnexion). Ne lève jamais d'erreur. */
export function clearReportFiles(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Dossier déjà parti ou illisible : rien à effacer.
  }
}
