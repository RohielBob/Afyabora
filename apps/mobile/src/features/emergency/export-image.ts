// Export du QR d'urgence en image (L6-06, CDC F10 « export en image ») : l'image PNG (dessinée par
// EmergencyQrImage, sans nouvelle dépendance : react-native-svg sait se convertir en PNG) est rangée dans le
// cache privé de l'application, puis confiée au partage du système : « Enregistrer l'image » (galerie),
// WhatsApp, impression… Une seule image à la fois, effacée à la déconnexion.
// Version web (aperçu de développement) : export-image.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const QR_IMAGE_NAME = 'afyabora-carte-urgence.png';

const folder = () => new Directory(Paths.cache, 'carte-urgence');

/** Range l'image (base64 PNG) puis ouvre le partage ; false si le partage n'existe pas sur l'appareil. */
export async function shareQrImage(base64Png: string, dialogTitle: string): Promise<boolean> {
  clearQrImages();
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, QR_IMAGE_NAME);
  file.create({ overwrite: true });
  file.write(base64Png, { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
  return true;
}

/** Supprime l'image rangée (nouvel export, déconnexion). Ne lève jamais d'erreur. */
export function clearQrImages(): void {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Dossier déjà parti ou illisible : rien à effacer.
  }
}
