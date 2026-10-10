// Trois points qui s'allument l'un après l'autre : indicateur d'attente discret (« on y travaille »).
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { easing, spacing, useReducedMotion, useTheme } from '@/theme';

function Dot({
  progress,
  index,
  color,
}: {
  progress: SharedValue<number>;
  index: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    // Chaque point s'allume avec un tiers de cycle de décalage.
    const phase = (progress.value + 1 - index / 3) % 1;
    const glow = interpolate(phase, [0, 0.3, 0.6, 1], [0.25, 1, 0.25, 0.25]);
    return { opacity: glow, transform: [{ translateY: -4 * (glow - 0.25) }] };
  });
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]}
    />
  );
}

export function LoadingDots({ color, label = 'Chargement' }: { color?: string; label?: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(withTiming(1, { duration: 1100, easing: easing.standard }), -1);
    return () => cancelAnimation(progress);
  }, [progress, reduced]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', height: 16 }}
    >
      {[0, 1, 2].map((i) => (
        <Dot key={i} progress={progress} index={i} color={color ?? colors.primary} />
      ))}
    </View>
  );
}
