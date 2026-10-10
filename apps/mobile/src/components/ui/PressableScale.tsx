// Base de toutes les zones touchables animées : l'élément s'enfonce légèrement au toucher (ressort doux),
// puis revient. Calculé par reanimated hors du fil JavaScript : fluide même si l'app est occupée.
import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { pressScale, springs, useReducedMotion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Contenu, ou fonction recevant `{ pressed }` pour changer l'apparence pendant le toucher. */
  children: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
  style?: StyleProp<ViewStyle>;
  /** Échelle au toucher : `button` (0,97) pour un bouton, `card` (0,985) pour une grande surface. */
  scaleTo?: keyof typeof pressScale;
}

export function PressableScale({
  children,
  style,
  scaleTo = 'button',
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        if (!reduced) scale.value = withSpring(pressScale[scaleTo], springs.press);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, springs.press);
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
