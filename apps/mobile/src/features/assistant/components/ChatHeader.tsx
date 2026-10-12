// En-tête de la conversation (L9-09) : retour, identité de l'assistant (logo + nom + ce sur quoi il
// s'appuie), et la touche « Urgence » (icône + libellé, jamais la couleur seule), toujours visible.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { LogoMark } from '@/components/brand';
import { PressableScale, Text } from '@/components/ui';
import { radii, spacing, touchTarget, useTheme } from '@/theme';

export function ChatHeader({
  onBack,
  emergencyOpen,
  onToggleEmergency,
}: {
  onBack: () => void;
  emergencyOpen: boolean;
  onToggleEmergency: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        hitSlop={8}
        style={{
          width: touchTarget,
          height: touchTarget,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </PressableScale>
      <LogoMark size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subheading" accessibilityRole="header" numberOfLines={1}>
          {t('assistant.title')}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {t('assistant.subtitle')}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('assistant.emergency.button')}
        accessibilityHint={t('assistant.emergency.buttonHint')}
        accessibilityState={{ expanded: emergencyOpen }}
        onPress={onToggleEmergency}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: touchTarget - 8,
          paddingHorizontal: spacing.md,
          borderRadius: radii.pill,
          borderWidth: 1.5,
          borderColor: colors.danger,
          backgroundColor: emergencyOpen ? colors.dangerSoft : 'transparent',
        }}
      >
        <Ionicons name="call" size={16} color={colors.danger} />
        <Text variant="label" tone="danger">
          {t('assistant.emergency.button')}
        </Text>
      </PressableScale>
    </View>
  );
}
