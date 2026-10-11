// Haut de l'écran « Analyse » (L3-04) : la période, le temps dans la plage cible (grand chiffre + barre
// en dessous / dans la plage / au-dessus qui se remplit), le nombre de mesures, la qualité des données et
// une phrase de résumé (« rien de particulier » ou « N observations à regarder de plus près »).
// Chaque état garde son symbole et son libellé : jamais la couleur seule, jamais de rouge.
// Pourcentages affichés = `displayPercents` du moteur : les mêmes que l'Accueil et que les phrases.
import { Ionicons } from '@expo/vector-icons';
import { displayPercents, type LastDaysAnalysis } from '@glyka/analytics';
import { STATE_SYMBOLS, type QualityLevel } from '@glyka/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Card, Text } from '@/components/ui';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { Headline } from '../presentation';

const QUALITY_ICON: Record<QualityLevel, 'checkmark-circle' | 'contrast' | 'ellipse-outline'> = {
  GOOD: 'checkmark-circle',
  PARTIAL: 'contrast',
  INSUFFICIENT: 'ellipse-outline',
};

/** Une part de la barre (en dessous / dans la plage / au-dessus), qui s'élargit avec `progress`. */
function Part({
  pct,
  color,
  progress,
}: {
  pct: number;
  color: string;
  progress: { value: number };
}) {
  const style = useAnimatedStyle(() => ({ width: `${pct * progress.value}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: color }, style]} />;
}

export function AnalysisSummary({
  analysis,
  days,
  headline,
  index = 0,
}: {
  analysis: LastDaysAnalysis;
  days: number;
  headline: Exclude<Headline, { kind: 'insufficient' }>;
  index?: number;
}) {
  const { t, i18n } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const stats = analysis.stats;
  const quality = analysis.quality;

  // La barre se remplit à l'arrivée et à chaque changement de période (≈ 0,4 s).
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: durations.slow, easing: easing.decelerate });
  }, [analysis, reduced, progress]);

  const shown = stats ? displayPercents(stats) : null;
  if (!stats || !shown) return null;
  const count = t('insights.summary.count', { count: stats.count });
  const level = t(`dashboard.quality.level.${quality.level}`);
  const levelColor =
    quality.level === 'GOOD'
      ? colors.success
      : quality.level === 'PARTIAL'
        ? colors.warning
        : colors.textMuted;
  // Fin de période exclue (minuit ce soir) : on affiche le dernier jour compris.
  const dateOf = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });
  const lastDay = new Date(Date.parse(analysis.period.to) - 1).toISOString();
  const calm = headline.kind === 'calm';

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
      <View
        accessible
        accessibilityLabel={t('insights.summary.a11y', {
          days,
          percent: shown.inRange,
          readings: count,
          score: quality.score,
          level,
        })}
        style={{ gap: spacing.md }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="overline" tone="muted" accessibilityRole="header">
            {t('insights.summary.title', { days })}
          </Text>
          <Text variant="caption" tone="muted">
            {t('insights.summary.range', {
              from: dateOf(analysis.period.from),
              to: dateOf(lastDay),
            })}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <Text variant="metric" style={{ fontVariant: ['tabular-nums'] }}>
            {shown.inRange} %
          </Text>
          <View style={{ paddingBottom: 6, gap: 2, flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text variant="caption" style={{ color: states.IN_RANGE.fg }}>
                {STATE_SYMBOLS.IN_RANGE.symbol}
              </Text>
              <Text variant="label">{t('insights.summary.inRange')}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {count}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            height: 8,
            borderRadius: radii.pill,
            overflow: 'hidden',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Part pct={shown.below} color={states.LOW.border} progress={progress} />
          <Part pct={shown.inRange} color={states.IN_RANGE.border} progress={progress} />
          <Part pct={shown.above} color={states.HIGH.border} progress={progress} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {STATE_SYMBOLS.LOW.symbol} {t('glucose.state.LOW')} {shown.below} %
          </Text>
          <Text variant="caption" tone="muted">
            {STATE_SYMBOLS.HIGH.symbol} {t('glucose.state.HIGH')} {shown.above} %
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name={QUALITY_ICON[quality.level]} size={16} color={levelColor} />
          <Text variant="bodySmall" tone="muted">
            {t('insights.summary.quality', { score: quality.score, level })}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Ionicons
          name={calm ? 'checkmark-done-outline' : 'eye-outline'}
          size={18}
          color={calm ? colors.success : colors.warning}
        />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {calm
            ? t('insights.headline.calm')
            : t('insights.headline.watch', { count: headline.watch })}
        </Text>
      </View>
    </Card>
  );
}
