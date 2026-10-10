// État de réussite (adresse vérifiée, mot de passe changé) : un cercle vert apparaît avec un léger ressort,
// la coche suit, puis le message et le bouton montent en fondu. Une réussite se « sent », sans en faire trop.
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Button, Text } from '@/components/ui';
import { durations, easing, spacing, springs, useReducedMotion, useTheme } from '@/theme';

export function SuccessState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const ok = states.IN_RANGE; // vert « tout va bien » de la palette

  return (
    <View
      accessibilityLiveRegion="polite"
      // Centré dans la hauteur de l'écran : la réussite est le seul élément affiché.
      style={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.lg,
        paddingVertical: spacing.xl,
      }}
    >
      <Animated.View
        entering={
          reduced
            ? undefined
            : ZoomIn.springify().damping(springs.bouncy.damping).stiffness(springs.bouncy.stiffness)
        }
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: ok.bg,
          borderWidth: 1,
          borderColor: ok.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View entering={reduced ? undefined : ZoomIn.delay(180).duration(durations.base)}>
          <Ionicons name="checkmark" size={46} color={colors.success} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        entering={
          reduced
            ? undefined
            : FadeInDown.delay(260).duration(durations.base).easing(easing.decelerate)
        }
        style={{ alignItems: 'center', gap: spacing.sm, width: '100%' }}
      >
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text tone="muted" align="center">
          {message}
        </Text>
        <View style={{ height: spacing.md }} />
        <Button label={actionLabel} size="lg" onPress={onAction} />
      </Animated.View>
    </View>
  );
}
