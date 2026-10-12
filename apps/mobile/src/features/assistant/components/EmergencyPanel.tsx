// Panneau « En cas d'urgence » (L9-09), ouvert par la touche « Urgence » de l'en-tête : toujours accessible,
// même sans réseau. Il ne passe jamais par l'assistant : il dit d'appeler les secours et propose les numéros
// du profil (lus à l'ouverture de la conversation). Aucun numéro enregistré : on ne devine rien.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { EmergencyCall } from '../presentation';
import { EmergencyCalls } from './EmergencyCalls';

export function EmergencyPanel({ calls }: { calls: readonly EmergencyCall[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const hasNumber = calls.some((c) => c.kind === 'emergency');
  return (
    <Animated.View
      entering={enterFromBelow(0, reduced)}
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.dangerSoft,
        borderColor: colors.danger,
        borderWidth: 1,
        borderRadius: radii.lg,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="alert-circle" size={22} color={colors.danger} />
        <Text variant="subheading" tone="danger" accessibilityRole="header">
          {t('assistant.emergency.title')}
        </Text>
      </View>
      <Text variant="body">{t('assistant.emergency.body')}</Text>
      <EmergencyCalls calls={calls} />
      {hasNumber ? null : (
        <Text variant="bodySmall" tone="muted">
          {t('assistant.emergency.noNumber')}
        </Text>
      )}
    </Animated.View>
  );
}
