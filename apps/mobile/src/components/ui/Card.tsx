// Carte : surface qui regroupe une information. Trois styles, apparition douce, et touchable si `onPress`.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { elevation, enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';

export type CardVariant = 'elevated' | 'outlined' | 'tinted';

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Position dans une liste : les cartes apparaissent l'une après l'autre (décalage court). */
  index?: number;
  /** Désactive l'animation d'entrée (carte déjà visible qui change de contenu). */
  animateIn?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  variant = 'elevated',
  onPress,
  accessibilityLabel,
  index = 0,
  animateIn = true,
  style,
}: CardProps) {
  const { colors, mode } = useTheme();
  const reduced = useReducedMotion();
  const shadow = elevation[mode === 'light' && variant === 'elevated' ? 2 : 0];

  const surface: ViewStyle = {
    backgroundColor:
      variant === 'tinted'
        ? colors.primarySoft
        : mode === 'dark' && variant === 'elevated'
          ? colors.surfaceRaised // en sombre, la hauteur se voit par une surface plus claire, pas par l'ombre
          : colors.surface,
    borderColor: variant === 'tinted' ? colors.primarySoftBorder : colors.border,
    borderWidth: variant === 'elevated' && mode === 'light' ? 0 : 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#101318',
    shadowOpacity: shadow.shadowOpacity,
    shadowRadius: shadow.shadowRadius,
    shadowOffset: { width: 0, height: shadow.shadowOffsetY },
    elevation: shadow.androidElevation,
  };

  const content = onPress ? (
    <PressableScale
      scaleTo="card"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[surface, style]}
    >
      {children}
    </PressableScale>
  ) : (
    <View accessibilityLabel={accessibilityLabel} style={[surface, style]}>
      {children}
    </View>
  );

  return animateIn ? (
    <Animated.View entering={enterFromBelow(index, reduced)}>{content}</Animated.View>
  ) : (
    content
  );
}
