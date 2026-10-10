// Statistiques de la période (L2-07, CDC F3) : temps dans la cible / au-dessus / en dessous, moyenne,
// écart-type, variabilité (coefficient de variation), nombre de mesures, et comparaison avec la période
// précédente (↑ ↓ →). Chiffres du moteur @glyka/analytics ; textes sobres, sans jugement médical.
//  - moins de 10 mesures : « Données insuffisantes » au lieu d'un pourcentage trompeur (CDC) ;
//  - la barre de répartition se remplit de gauche à droite (≈ 0,4 s) à chaque changement de période ;
//  - flèches neutres (ni vert ni rouge) : une hausse n'est pas forcément « mauvaise », on décrit seulement.
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  MIN_MEASUREMENTS_FOR_ANALYSIS,
  STATE_SYMBOLS,
  UNIT_LABELS,
  formatGlucose,
  type GlucoseState,
  type GlucoseUnit,
} from '@glyka/shared';
import { Card, Text } from '@/components/ui';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { ChartPeriod } from '../chart';
import {
  meanChange,
  roundedPercents,
  timeInRangeChange,
  type Change,
  type PeriodStats,
} from '../stats';

const ARROW: Record<Change['direction'], 'arrow-up' | 'arrow-down' | 'arrow-forward'> = {
  up: 'arrow-up',
  down: 'arrow-down',
  flat: 'arrow-forward',
};

export function StatsCard({
  data,
  period,
  unit,
  index = 0,
}: {
  data: PeriodStats;
  period: ChartPeriod;
  unit: GlucoseUnit;
  index?: number;
}) {
  const { t } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const { stats, previous, count } = data;

  // Remplissage de la barre : relancé quand la période ou les chiffres changent.
  const fill = useSharedValue(reduced ? 1 : 0);
  const key = `${period}-${stats?.timeInRangePct ?? 'x'}-${count}`;
  useEffect(() => {
    if (reduced) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    fill.value = withTiming(1, { duration: durations.slow, easing: easing.decelerate });
  }, [key, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
      }}
    >
      <Text variant="overline" tone="muted" accessibilityRole="header">
        {t('dashboard.stats.title')}
      </Text>
      <Text variant="caption" tone="muted">
        {t('dashboard.stats.count', { count, days: period })}
      </Text>
    </View>
  );

  if (!stats) {
    return (
      <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
        {header}
        <Animated.View
          key={`insufficient-${period}`}
          entering={reduced ? undefined : FadeIn.duration(durations.base)}
          style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Ionicons name="hourglass-outline" size={20} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{t('dashboard.stats.insufficientTitle')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('dashboard.stats.insufficient', {
                min: MIN_MEASUREMENTS_FOR_ANALYSIS,
                days: period,
                count,
              })}
            </Text>
          </View>
        </Animated.View>
      </Card>
    );
  }

  // Répartition : en dessous / dans la plage / au-dessus, en pourcentages qui font 100.
  const [below, inRange, above] = roundedPercents([
    stats.timeBelowPct ?? 0,
    stats.timeInRangePct ?? 0,
    stats.timeAbovePct ?? 0,
  ]) as [number, number, number];
  const parts: { state: GlucoseState; pct: number; label: string }[] = [
    { state: 'LOW', pct: below, label: t('glucose.state.LOW') },
    { state: 'IN_RANGE', pct: inRange, label: t('glucose.state.IN_RANGE') },
    { state: 'HIGH', pct: above, label: t('glucose.state.HIGH') },
  ];
  const shareA11y = t('dashboard.stats.shareA11y', { below, inRange, above });

  // Nombre en grand, unité en petit dessous : « 7,7 » / « mmol/L » tient dans une tuile étroite.
  const inUnit = (mgDl: number | null) =>
    mgDl !== null ? formatGlucose(Math.round(mgDl), unit, false) : '—';
  const tiles = [
    {
      key: 'mean',
      label: t('dashboard.stats.mean'),
      value: inUnit(stats.meanMgDl),
      unit: UNIT_LABELS[unit],
    },
    {
      key: 'sd',
      label: t('dashboard.stats.sd'),
      value: inUnit(stats.sdMgDl),
      unit: UNIT_LABELS[unit],
    },
    {
      key: 'cv',
      label: t('dashboard.stats.cv'),
      value: stats.cvPercent !== null ? `${Math.round(stats.cvPercent)}` : '—',
      unit: '%',
    },
  ];

  const tir = previous ? timeInRangeChange(stats, previous) : null;
  const mean = previous ? meanChange(stats, previous) : null;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const changes = [
    tir && {
      key: 'tir',
      change: tir,
      text: t('dashboard.stats.tirChange', {
        value:
          tir.direction === 'flat'
            ? t('dashboard.stats.stable')
            : t('dashboard.stats.points', { sign: sign(tir.delta), count: Math.abs(tir.delta) }),
      }),
    },
    mean && {
      key: 'mean',
      change: mean,
      text: t('dashboard.stats.meanChange', {
        value:
          mean.direction === 'flat'
            ? t('dashboard.stats.stable')
            : `${sign(mean.delta)}${formatGlucose(Math.abs(mean.delta), unit)}`,
      }),
    },
  ].filter(Boolean) as { key: string; change: Change; text: string }[];

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.lg }}>
      {header}

      {/* Répartition dans / au-dessus / en dessous de la plage cible */}
      <View accessible accessibilityLabel={shareA11y} style={{ gap: spacing.md }}>
        <View
          style={{
            height: 12,
            borderRadius: radii.pill,
            overflow: 'hidden',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Animated.View style={[{ height: '100%', flexDirection: 'row' }, fillStyle]}>
            {parts.map((part) =>
              part.pct > 0 ? (
                <View
                  key={part.state}
                  style={{
                    flex: part.pct,
                    backgroundColor: states[part.state].fg,
                  }}
                />
              ) : null,
            )}
          </Animated.View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {parts.map((part) => (
            <View key={part.state} style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                {part.pct} %
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                <Text variant="caption" style={{ color: states[part.state].fg }}>
                  {STATE_SYMBOLS[part.state].symbol}
                </Text>{' '}
                {part.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Moyenne, écart-type, variabilité */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            accessible
            accessibilityLabel={`${tile.label} : ${tile.value} ${tile.unit}`}
            style={{
              flex: 1,
              gap: 2,
              paddingVertical: spacing.sm + 2,
              paddingHorizontal: spacing.sm + 2,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {tile.label}
            </Text>
            <Text variant="subheading" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {tile.value}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {tile.unit}
            </Text>
          </View>
        ))}
      </View>

      {/* Comparaison avec la période précédente */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" tone="muted">
          {t('dashboard.stats.compareTitle', { days: period })}
        </Text>
        {changes.length ? (
          changes.map((item) => (
            <View
              key={item.key}
              accessible
              accessibilityLabel={`${item.text} (${t(`dashboard.stats.direction.${item.change.direction}`)})`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceMuted,
                }}
              >
                <Ionicons name={ARROW[item.change.direction]} size={15} color={colors.text} />
              </View>
              <Text variant="bodySmall" style={{ flexShrink: 1 }}>
                {item.text}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="bodySmall" tone="muted">
            {t('dashboard.stats.noPrevious', { days: period })}
          </Text>
        )}
      </View>
    </Card>
  );
}
