// Version web de export-image.ts (aperçu dans le navigateur, développement uniquement) : pas de feuille de
// partage, l'image est téléchargée. Sur téléphone, c'est export-image.ts qui est utilisé.
export const QR_IMAGE_NAME = 'afyabora-carte-urgence.png';

export async function shareQrImage(base64Png: string, _dialogTitle: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Png}`;
  link.download = QR_IMAGE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export function clearQrImages(): void {
  // Rien n'est gardé dans le navigateur.
}
