// Mesure enregistrée (L2-03) : un cercle vert apparaît avec un léger ressort, la coche suit, puis une carte
// résume ce qui a été noté (valeur en grand, contexte, moment) et rappelle qu'elle est GARDÉE SUR CE
// TÉLÉPHONE (synchronisation plus tard, ADR-0004). Deux actions : en ajouter une autre, ou terminer.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Button, Card, Text } from '@/components/ui';
import { durations, easing, spacing, springs, useReducedMotion, useTheme } from '@/theme';

export function SavedState({
  value,
  detail,
  onAnother,
  onDone,
}: {
  /** Ex. « 1,48 g/L » */
  value: string;
  /** Ex. « À jeun · Aujourd'hui, 08:30 » */
  detail: string;
  onAnother: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const ok = states.IN_RANGE; // vert « tout va bien » de la palette (jamais le rouge de la marque)
  const enter = (delay: number) =>
    reduced
      ? undefined
      : FadeInDown.delay(delay).duration(durations.base).easing(easing.decelerate);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexGrow: 1,
        justifyContent: 'center',
        gap: spacing.xl,
        paddingVertical: spacing.xl,
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.lg }}>
        <Animated.View
          entering={
            reduced
              ? undefined
              : ZoomIn.springify()
                  .damping(springs.bouncy.damping)
                  .stiffness(springs.bouncy.stiffness)
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
          <Animated.View
            entering={reduced ? undefined : ZoomIn.delay(180).duration(durations.base)}
          >
            <Ionicons name="checkmark" size={46} color={colors.success} />
          </Animated.View>
        </Animated.View>
        <Animated.View entering={enter(220)}>
          <Text variant="title" align="center" accessibilityRole="header">
            {t('measurement.saved.title')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={enter(300)}>
        <Card
          variant="outlined"
          animateIn={false}
          style={{ alignItems: 'center', gap: spacing.xs }}
        >
          <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
          <Text tone="muted" align="center">
            {detail}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginTop: spacing.sm,
            }}
          >
            <Ionicons name="phone-portrait-outline" size={16} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={{ flexShrink: 1 }}>
              {t('measurement.saved.local')}
            </Text>
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(380)} style={{ gap: spacing.sm }}>
        <Button label={t('measurement.saved.another')} size="lg" onPress={onAnother} />
        <Button label={t('measurement.saved.done')} variant="ghost" onPress={onDone} />
      </Animated.View>
    </View>
  );
}
