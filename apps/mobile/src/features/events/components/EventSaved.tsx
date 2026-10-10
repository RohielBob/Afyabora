// Événement enregistré (L2-10) : même langage que l'écran de réussite d'une mesure (L2-03) — un cercle
// apparaît avec un léger ressort, la coche suit, puis une carte résume ce qui a été noté et rappelle qu'il
// est GARDÉ SUR CE TÉLÉPHONE. Deux actions : en ajouter un autre, ou terminer.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { LifeEventType } from '@glyka/shared';
import { Button, Card, Text } from '@/components/ui';
import { durations, easing, radii, spacing, springs, useReducedMotion, useTheme } from '@/theme';
import { EVENT_ICON } from './TypeTiles';

export function EventSaved({
  type,
  label,
  detail,
  onAnother,
  onDone,
}: {
  type: LifeEventType;
  label: string;
  /** Ex. « Activité · 30 min · Aujourd'hui, 18:00 » */
  detail: string;
  onAnother: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const ok = states.IN_RANGE; // vert « tout va bien » (jamais le rouge de la marque)
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
            {t('event.saved.title')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={enter(300)}>
        <Card
          variant="outlined"
          animateIn={false}
          style={{ alignItems: 'center', gap: spacing.sm }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Ionicons name={EVENT_ICON[type]} size={24} color={colors.text} />
          </View>
          <Text variant="heading" align="center">
            {label}
          </Text>
          <Text tone="muted" align="center">
            {detail}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={{ flexShrink: 1 }}>
              {t('event.saved.local')}
            </Text>
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enter(380)} style={{ gap: spacing.sm }}>
        <Button label={t('event.saved.another')} size="lg" onPress={onAnother} />
        <Button label={t('event.saved.done')} variant="ghost" onPress={onDone} />
      </Animated.View>
    </View>
  );
}
