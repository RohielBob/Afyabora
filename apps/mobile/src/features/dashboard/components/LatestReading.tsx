// Carte « Dernière mesure » (L2-05, CDC F3) : la valeur en grand dans l'unité préférée, son état
// (couleur + symbole + libellé, seuils du patient), le contexte, le jour et l'heure, et depuis quand.
// Une bande à gauche reprend la couleur de l'état : un repère visuel, jamais le seul (badge + texte).
// Quand une nouvelle mesure arrive, la valeur réapparaît en fondu (clé = identifiant de la mesure).
// L2-11 : toucher la mesure ouvre son détail (modifier, supprimer).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { classifyGlucose, type GlucoseThresholds, type GlucoseUnit } from '@glyka/shared';
import { Button, Card, PressableScale, RangeBadge, Text } from '@/components/ui';
import { formatClock, formatReading, type LatestMeasurement } from '@/features/measurements';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { ageOf, dayLabel } from '../latest';

export function LatestReading({
  latest,
  unit,
  thresholds,
  now,
  index = 0,
}: {
  latest: LatestMeasurement;
  unit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  now: Date;
  index?: number;
}) {
  const { t, i18n } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();

  const date = new Date(latest.measuredAt);
  const state = classifyGlucose(latest.valueMgDl, thresholds);
  const value = formatReading(latest.valueMgDl, unit);
  const label = dayLabel(date, now);
  const day =
    label === 'earlier'
      ? date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
      : t(`dashboard.latest.${label}`);
  const when = t('dashboard.latest.when', {
    day,
    time: formatClock(date.getHours(), date.getMinutes()),
  });
  const age = ageOf(date, now);
  const ageText =
    age.key === 'justNow'
      ? t('dashboard.latest.age.justNow')
      : t(`dashboard.latest.age.${age.key}`, { count: age.count });
  const context = t(`measurement.context.${latest.context}`);

  return (
    <Card variant="outlined" index={index} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 5, backgroundColor: states[state].bg }} />
        <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
            }}
          >
            <Text variant="overline" tone="muted">
              {t('dashboard.latest.title')}
            </Text>
            <Text variant="caption" tone="muted">
              {ageText}
            </Text>
          </View>

          {/* Un seul bloc pour le lecteur d'écran : « Dernière mesure : 1,48 g/L, dans la plage, … ». */}
          <PressableScale
            accessibilityRole="button"
            accessibilityHint={t('timeline.openHint')}
            onPress={() =>
              router.push({ pathname: '/measurement/[id]', params: { id: latest.id } })
            }
          >
            <Animated.View
              key={latest.id}
              entering={reduced ? undefined : FadeIn.duration(durations.base)}
              accessible
              accessibilityLabel={t('dashboard.latest.a11y', {
                value,
                state: t(`glucose.state.${state}`),
                context,
                when,
              })}
              style={{ gap: spacing.sm }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  columnGap: spacing.md,
                  rowGap: spacing.xs,
                }}
              >
                <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
                  {value}
                </Text>
                <RangeBadge state={state} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text variant="bodySmall" tone="muted" style={{ flexShrink: 1 }}>
                  {context} · {when}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              </View>
            </Animated.View>
          </PressableScale>

          <Button
            label={t('dashboard.latest.add')}
            variant="secondary"
            size="sm"
            icon={<Ionicons name="add" size={18} color={colors.primaryText} />}
            onPress={() => router.push('/measurement/new')}
            style={{ alignSelf: 'flex-start', borderRadius: radii.pill }}
          />
        </View>
      </View>
    </Card>
  );
}
