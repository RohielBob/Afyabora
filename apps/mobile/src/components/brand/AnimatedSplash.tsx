// Écran de lancement animé (ADR-0008), joué UNE fois au démarrage, juste après l'écran natif :
//  1. la goutte apparaît avec un léger ressort ;
//  2. le tracé de pouls se dessine de gauche à droite ;
//  3. la goutte « bat » une fois, le nom Afyabora monte en fondu ;
//  4. le tout s'efface en fondu et laisse place à l'application.
// Durée totale ≈ 1,6 s. Animations réduites : logo fixe, simple fondu court.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Polyline } from 'react-native-svg';
import { durations, easing, springs, useReducedMotion, useTheme } from '@/theme';
import { Text } from '../ui/Text';
import {
  DROP_PATH,
  DropGradient,
  HEART_PATH,
  MARK_HEIGHT,
  MARK_WIDTH,
  PULSE_COLOR,
  PULSE_LENGTH,
  PULSE_POINTS,
  Wordmark,
} from './Logo';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const LOGO_HEIGHT = 112;
const LOGO_WIDTH = (LOGO_HEIGHT * MARK_WIDTH) / MARK_HEIGHT;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const dropScale = useSharedValue(reduced ? 1 : 0.72);
  const dropOpacity = useSharedValue(reduced ? 1 : 0);
  const pulse = useSharedValue(reduced ? 1 : 0); // 0 = tracé caché, 1 = tracé complet
  const word = useSharedValue(reduced ? 1 : 0);
  const screen = useSharedValue(1);

  useEffect(() => {
    const finish = () => {
      screen.value = withTiming(0, { duration: 280, easing: easing.accelerate }, (done) => {
        if (done) runOnJS(onFinish)();
      });
    };

    if (reduced) {
      const timer = setTimeout(finish, 350);
      return () => clearTimeout(timer);
    }

    dropOpacity.value = withTiming(1, { duration: durations.base, easing: easing.decelerate });
    dropScale.value = withSequence(
      withSpring(1, springs.bouncy),
      withDelay(520, withTiming(1.07, { duration: 140, easing: easing.standard })), // battement
      withTiming(1, { duration: 220, easing: easing.standard }),
    );
    pulse.value = withDelay(220, withTiming(1, { duration: 620, easing: easing.standard }));
    word.value = withDelay(
      480,
      withTiming(1, { duration: durations.slow, easing: easing.decelerate }),
    );

    const timer = setTimeout(finish, 1350);
    return () => clearTimeout(timer);
  }, [reduced, dropOpacity, dropScale, pulse, word, screen, onFinish]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screen.value }));
  const dropStyle = useAnimatedStyle(() => ({
    opacity: dropOpacity.value,
    transform: [{ scale: dropScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 10 }],
  }));
  const pulseProps = useAnimatedProps(() => ({
    strokeDashoffset: PULSE_LENGTH * (1 - pulse.value),
  }));

  return (
    <Animated.View
      accessible
      accessibilityLabel="Afyabora, chargement"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { backgroundColor: colors.background },
        screenStyle,
      ]}
    >
      <Animated.View style={dropStyle}>
        <Svg width={LOGO_WIDTH} height={LOGO_HEIGHT} viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}>
          <DropGradient id="splashDrop" />
          <Path d={DROP_PATH} fill="url(#splashDrop)" />
          <Path d={HEART_PATH} fill="#FFFFFF" />
          <AnimatedPolyline
            points={PULSE_POINTS}
            fill="none"
            stroke={PULSE_COLOR}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${PULSE_LENGTH} ${PULSE_LENGTH}`}
            animatedProps={pulseProps}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.word, wordStyle]}>
        <Wordmark size={34} />
        <View style={{ marginTop: 4 }}>
          <Text variant="bodySmall" tone="muted" align="center">
            Suivez. Comprenez. Partagez.
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  word: { marginTop: 18, alignItems: 'center' },
});
