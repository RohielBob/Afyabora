// « Voir les mesures concernées » (CDC F6, traçabilité) : les mesures qui justifient une observation, de la
// plus récente à la plus ancienne. Chaque ligne : jour et heure, valeur dans l'unité du patient, badge d'état
// (couleur + symbole + libellé), contexte ; on la touche pour ouvrir le détail de la mesure (L2-11).
// Les 5 premières d'abord, puis « Afficher les N autres ».
import { Ionicons } from '@expo/vector-icons';
import { classifyGlucose, type GlucoseThresholds, type GlucoseUnit } from '@glyka/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale, RangeBadge, Text } from '@/components/ui';
import { dayLabel } from '@/features/dashboard';
import { formatClock, formatReading, type MeasurementPoint } from '@/features/measurements';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { EVIDENCE_PREVIEW } from '../presentation';

function EvidenceRow({
  point,
  unit,
  thresholds,
  now,
  index,
}: {
  point: MeasurementPoint;
  unit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  now: Date;
  index: number;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const date = new Date(point.at);
  const label = dayLabel(date, now);
  const day =
    label === 'earlier'
      ? date.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
      : t(`dashboard.latest.${label}`);
  const when = t('dashboard.latest.when', {
    day,
    time: formatClock(date.getHours(), date.getMinutes()),
  });
  const value = formatReading(point.mgDl, unit);
  const state = classifyGlucose(point.mgDl, thresholds);
  const context = t(`measurement.context.${point.context}`);

  return (
    <Animated.View entering={enterFromBelow(Math.min(index, 6), reduced)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('insights.evidence.a11y', {
          when,
          value,
          state: t(`glucose.state.${state}`),
          context,
        })}
        accessibilityHint={t('insights.evidence.openHint')}
        onPress={() => router.push(`/measurement/${point.id}`)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            {when}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
              {value}
            </Text>
            <RangeBadge state={state} size="sm" />
          </View>
          <Text variant="caption" tone="muted">
            {context}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </PressableScale>
    </Animated.View>
  );
}

export function EvidenceList({
  points,
  unit,
  thresholds,
  now,
}: {
  points: readonly MeasurementPoint[];
  unit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  now: Date;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? points : points.slice(0, EVIDENCE_PREVIEW);
  const hidden = points.length - shown.length;

  return (
    <View style={{ gap: spacing.sm }}>
      {shown.map((point, i) => (
        <EvidenceRow
          key={point.id}
          point={point}
          unit={unit}
          thresholds={thresholds}
          now={now}
          index={i}
        />
      ))}
      {hidden > 0 ? (
        <PressableScale
          accessibilityRole="button"
          onPress={() => setAll(true)}
          style={{ alignSelf: 'flex-start', paddingVertical: spacing.xs }}
        >
          <Text variant="label" tone="primary">
            {t('insights.evidence.more', { count: hidden })}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
