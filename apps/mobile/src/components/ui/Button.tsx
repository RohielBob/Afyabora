import { Pressable, Text } from 'react-native';
import { radii, spacing, useTheme } from '@/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: primary ? theme.primary : 'transparent',
        borderColor: theme.primary,
        borderWidth: 1.5,
        borderRadius: radii.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        minHeight: 48, // cible tactile accessible
      }}
    >
      <Text style={{ color: primary ? '#FFFFFF' : theme.primary, fontWeight: '600', fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}
