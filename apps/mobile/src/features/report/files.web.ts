// Version navigateur de files.ts (aperçu web, développement uniquement) : pas de système de fichiers ni de
// feuille de partage. Le PDF est gardé en mémoire (adresse `blob:`) et « partager » le télécharge.
// Sur téléphone, c'est files.ts qui est utilisé, jamais ce fichier.

export interface SavedReport {
  uri: string;
  filename: string;
}

let current: string | null = null;

export async function saveReport(bytes: Uint8Array, filename: string): Promise<SavedReport> {
  clearReportFiles();
  current = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  return { uri: current, filename };
}

export async function shareReport(saved: SavedReport, _dialogTitle: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const link = document.createElement('a');
  link.href = saved.uri;
  link.download = saved.filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export function clearReportFiles(): void {
  if (current) URL.revokeObjectURL(current);
  current = null;
}
