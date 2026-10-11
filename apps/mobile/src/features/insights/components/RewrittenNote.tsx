// Mention discrète sous une phrase reformulée par le modèle de langage du serveur (L3-09) : le patient sait
// que la formulation vient de l'IA, et que ses chiffres ont été vérifiés (ce sont ceux du moteur).
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export function RewrittenNote() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Ionicons name="sparkles-outline" size={12} color={colors.textMuted} />
      <Text variant="caption" tone="muted">
        {t('insights.rewritten')}
      </Text>
    </View>
  );
}
