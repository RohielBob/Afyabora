// Version navigateur de files.ts (aperçu web, développement uniquement) : pas de système de fichiers ni de
// feuille de partage. L'export est gardé en mémoire (adresse `blob:`) et « partager » le télécharge.
// Sur téléphone, c'est files.ts qui est utilisé, jamais ce fichier.

export interface SavedExport {
  uri: string;
  filename: string;
}

let current: string | null = null;

export async function saveExport(bytes: Uint8Array, filename: string): Promise<SavedExport> {
  clearExportFiles();
  current = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/json' }));
  return { uri: current, filename };
}

export async function shareExport(saved: SavedExport, _dialogTitle: string): Promise<boolean> {
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

export function clearExportFiles(): void {
  if (current) URL.revokeObjectURL(current);
  current = null;
}
