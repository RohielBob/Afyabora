// Bouton « + » au centre de la barre d'onglets (CDC F2 : « bouton + toujours accessible »).
// Un rond rouge Afyabora, légèrement surélevé au-dessus de la barre, qui s'enfonce un peu au toucher et
// ouvre la saisie d'une mesure. Forme + icône + libellé lu par le lecteur d'écran.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PressableScale } from '@/components/ui';
import { useTheme } from '@/theme';

export function AddTabButton() {
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('measurement.addA11y')}
        onPress={() => router.push('/measurement/new')}
        style={{
          width: 58,
          height: 58,
          marginTop: -18, // dépasse au-dessus de la barre : on le trouve sans chercher
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
          borderWidth: 4,
          borderColor: colors.surface, // détache le bouton de la barre
          shadowColor: colors.primary,
          shadowOpacity: mode === 'dark' ? 0 : 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </PressableScale>
    </View>
  );
}
