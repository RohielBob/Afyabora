// Écran de chargement plein écran (ex. ouverture de session, synchronisation initiale) :
// la goutte « respire » doucement au rythme d'un cœur au repos, avec un message et trois points.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { easing, spacing, useReducedMotion, useTheme } from '@/theme';
import { LoadingDots } from '../ui/LoadingDots';
import { Text } from '../ui/Text';
import { LogoMark } from './Logo';

export function LoadingScreen({ message = 'Chargement…' }: { message?: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const beat = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    // Battement : petite contraction rapide, puis repos (≈ 70 battements/min).
    beat.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 160, easing: easing.standard }),
        withTiming(1, { duration: 260, easing: easing.standard }),
        withTiming(1, { duration: 440 }),
      ),
      -1,
    );
    return () => cancelAnimation(beat);
  }, [beat, reduced]);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xl,
        backgroundColor: colors.background,
      }}
    >
      <Animated.View style={logoStyle}>
        <LogoMark size={76} />
      </Animated.View>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Text variant="subheading">{message}</Text>
        <LoadingDots label={message} />
      </View>
    </View>
  );
}
