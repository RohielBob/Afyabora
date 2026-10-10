// Ligne de liste (réglages, menus) : icône, titre, sous-titre, valeur et chevron. Le fond se teinte au toucher.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { radii, spacing, touchTarget, useTheme } from '@/theme';
import { Text } from './Text';

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  showChevron = !!onPress,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={subtitle}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touchTarget + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radii.sm,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="bodySmall" tone="muted">
          {value}
        </Text>
      ) : null}
      {showChevron ? (
        <Text variant="heading" tone="subtle" accessibilityElementsHidden>
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}
