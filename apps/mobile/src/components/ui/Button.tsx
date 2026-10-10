// Bouton Afyabora : 5 variantes, 3 tailles, état de chargement.
// Animations : enfoncement au toucher (PressableScale) ; pendant le chargement, le libellé laisse
// la place à l'indicateur en fondu, sans que le bouton change de taille.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { fadeIn, fadeOut, radii, spacing, touchTarget, useTheme, type ThemeColors } from '@/theme';
import { PressableScale } from './PressableScale';
import { Spinner } from './Spinner';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, { height: number; paddingX: number; radius: number }> = {
  sm: { height: 40, paddingX: spacing.lg, radius: radii.sm },
  md: { height: touchTarget, paddingX: spacing.xl, radius: radii.md },
  lg: { height: 56, paddingX: spacing.xl, radius: radii.lg },
};

/** Couleurs de fond / bordure / texte selon la variante, au repos et enfoncé. */
function palette(c: ThemeColors, variant: ButtonVariant, pressed: boolean) {
  switch (variant) {
    case 'primary':
      return { bg: pressed ? c.primaryPressed : c.primary, border: 'transparent', fg: c.onPrimary };
    case 'secondary':
      return {
        bg: c.primarySoft,
        border: pressed ? c.primarySoftBorder : c.primarySoft,
        fg: c.primaryText,
      };
    case 'outline':
      return { bg: pressed ? c.surfaceMuted : 'transparent', border: c.borderStrong, fg: c.text };
    case 'ghost':
      return {
        bg: pressed ? c.primarySoft : 'transparent',
        border: 'transparent',
        fg: c.primaryText,
      };
    case 'danger':
      return { bg: pressed ? c.dangerSoft : 'transparent', border: c.danger, fg: c.danger };
  }
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Icône à gauche du libellé (ex. <Ionicons …/>). */
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  fullWidth = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors, mode } = useTheme();
  const s = SIZE[size];
  const inactive = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={[{ alignSelf: fullWidth ? 'stretch' : 'flex-start' }, style]}
    >
      {({ pressed }) => {
        const p = palette(colors, variant, pressed);
        return (
          <View
            style={{
              minHeight: s.height,
              paddingHorizontal: s.paddingX,
              borderRadius: s.radius,
              backgroundColor: p.bg,
              borderWidth: variant === 'outline' || variant === 'danger' ? 1.5 : 1,
              borderColor: p.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.45 : 1,
              // Légère ombre colorée sous le bouton principal (mode clair uniquement) : profondeur sans lourdeur.
              ...(variant === 'primary' && mode === 'light' && !disabled
                ? {
                    shadowColor: colors.primary,
                    shadowOpacity: pressed ? 0.12 : 0.24,
                    shadowRadius: pressed ? 6 : 12,
                    shadowOffset: { width: 0, height: pressed ? 2 : 6 },
                    elevation: pressed ? 1 : 3,
                  }
                : null),
            }}
          >
            {loading ? (
              <Animated.View key="spinner" entering={fadeIn()} exiting={fadeOut()}>
                <Spinner size={20} color={p.fg} label={`${label} en cours`} />
              </Animated.View>
            ) : (
              <Animated.View
                key="label"
                entering={fadeIn()}
                exiting={fadeOut()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                {icon}
                <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: p.fg }}>
                  {label}
                </Text>
              </Animated.View>
            )}
          </View>
        );
      }}
    </PressableScale>
  );
}
