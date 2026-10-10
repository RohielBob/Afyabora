// Police Plus Jakarta Sans (une graisse = un fichier), chargée une fois au démarrage (app/_layout.tsx).
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { fontFiles } from '@glyka/ui-tokens';

/** Clés = noms utilisés par `fontFiles` dans les jetons, valeurs = fichiers de police. */
export const appFonts = {
  [fontFiles.regular]: PlusJakartaSans_400Regular,
  [fontFiles.medium]: PlusJakartaSans_500Medium,
  [fontFiles.semibold]: PlusJakartaSans_600SemiBold,
  [fontFiles.bold]: PlusJakartaSans_700Bold,
  [fontFiles.extrabold]: PlusJakartaSans_800ExtraBold,
};
