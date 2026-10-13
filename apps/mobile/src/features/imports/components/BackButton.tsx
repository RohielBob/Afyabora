// « Retour » des écrans de l'import (L4-06, L4-07) : revient à l'étape précédente, le choix fait est gardé.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale, Text } from '@/components/ui';
import { spacing, touchTarget, useTheme } from '@/theme';

export function BackButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label ?? t('common.back')}
      onPress={onPress}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        alignSelf: 'flex-start',
        minHeight: touchTarget - 8,
      }}
    >
      <Ionicons name="chevron-back" size={20} color={colors.primaryText} />
      <Text variant="label" tone="primary">
        {t('common.back')}
      </Text>
    </PressableScale>
  );
}
