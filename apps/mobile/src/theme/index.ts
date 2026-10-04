import { useColorScheme } from 'react-native';
import { colors, darkColors } from '@glyka/ui-tokens';

export { colors, darkColors, spacing, radii, fontSizes, fontWeights, fontFamilies } from '@glyka/ui-tokens';

/** Palette selon le mode clair/sombre du téléphone. */
export function useTheme() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : colors;
}
