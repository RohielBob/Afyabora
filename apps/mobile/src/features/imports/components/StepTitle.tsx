// Titre d'une étape de l'import : numéro dans une pastille + intitulé (« 1 Le fichier »). Le numéro est
// aussi dans le texte lu par le lecteur d'écran (« Étape 1 : Le fichier »), pas seulement dessiné.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

export function StepTitle({ number, title }: { number: number; title: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t('import.stepLabel', { number, title })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.primarySoftBorder,
        }}
      >
        <Text variant="caption" tone="primary">
          {number}
        </Text>
      </View>
      <Text variant="subheading">{title}</Text>
    </View>
  );
}
