// Indicateur de chargement : un arc qui tourne en continu (vitesse constante, sans à-coup).
// Animations réduites : l'arc reste fixe et pulse doucement en opacité.
import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion, useTheme } from '@/theme';

export function Spinner({
  size = 22,
  color,
  label = 'Chargement',
}: {
  size?: number;
  color?: string;
  label?: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: reduced ? 1200 : 850, easing: Easing.linear }),
      -1,
      reduced, // en mode réduit : aller-retour (pulsation) au lieu d'une rotation
    );
    return () => cancelAnimation(progress);
  }, [progress, reduced]);

  const animatedStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: 0.4 + progress.value * 0.6 }
      : { transform: [{ rotate: `${progress.value * 360}deg` }] },
  );

  const stroke = Math.max(2, size / 9);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const tint = color ?? colors.primary;

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[{ width: size, height: size }, animatedStyle]}
    >
      <Svg width={size} height={size}>
        {/* Piste discrète */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint}
          strokeOpacity={0.18}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Arc d'un quart de tour */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.28} ${circumference}`}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
