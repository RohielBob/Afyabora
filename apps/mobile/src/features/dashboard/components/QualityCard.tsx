// Score de qualité des données (L2-08, CDC F3 « avec explication en une phrase », §5.3).
//  - anneau qui se remplit jusqu'au score (≈ 0,4 s), le score au centre (« 82 / 100 ») ;
//  - niveau Bonne / Partielle / Insuffisante : icône + libellé + couleur (jamais la couleur seule, et
//    jamais le rouge de la marque : la qualité des DONNÉES n'est pas une alerte de santé) ;
//  - une phrase qui explique ce qui fait baisser le score (jours mesurés, mesures par jour, ancienneté) ;
//  - les trois composantes de la formule en petites barres : le calcul reste transparent.
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { QualityLevel } from '@glyka/shared';
import { Card, Text } from '@/components/ui';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { ChartPeriod } from '../chart';
import { TARGET_PER_DAY, type PeriodQuality } from '../quality';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 84;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const LEVEL_ICON: Record<QualityLevel, 'checkmark-circle' | 'contrast' | 'ellipse-outline'> = {
  GOOD: 'checkmark-circle',
  PARTIAL: 'contrast',
  INSUFFICIENT: 'ellipse-outline',
};

/** Petite barre d'une composante (0–100), qui se remplit avec l'anneau. */
function PartBar({
  label,
  value,
  progress,
  color,
}: {
  label: string;
  value: number;
  progress: { value: number };
  color: string;
}) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => ({ width: `${value * progress.value}%` }));
  return (
    <View accessible accessibilityLabel={`${label} : ${value} %`} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
          {value} %
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: radii.pill,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ height: '100%', borderRadius: radii.pill, backgroundColor: color }, style]}
        />
      </View>
    </View>
  );
}

export function QualityCard({
  data,
  period,
  index = 0,
}: {
  data: PeriodQuality;
  period: ChartPeriod;
  index?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const { quality, reason, perDay, daysSinceLast } = data;

  // Couleur du niveau : vert « succès », ambre « attention », gris neutre. Jamais le rouge.
  const levelColor =
    quality.level === 'GOOD'
      ? colors.success
      : quality.level === 'PARTIAL'
        ? colors.warning
        : colors.textMuted;

  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: durations.slow, easing: easing.decelerate });
  }, [quality.score, period, reduced, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - (quality.score / 100) * progress.value),
  }));

  const sentence =
    reason === 'empty'
      ? t('dashboard.quality.reason.empty', { days: period })
      : reason === 'good'
        ? t('dashboard.quality.reason.good', {
            covered: quality.daysWithData,
            days: quality.daysInPeriod,
            perDay: perDay.toString().replace('.', ','),
          })
        : reason === 'coverage'
          ? t('dashboard.quality.reason.coverage', {
              covered: quality.daysWithData,
              days: quality.daysInPeriod,
            })
          : reason === 'density'
            ? t('dashboard.quality.reason.density', {
                // count : accord (« 1,5 mesure », « 2,6 mesures ») ; perDay : affichage avec virgule.
                count: perDay,
                perDay: perDay.toString().replace('.', ','),
                target: TARGET_PER_DAY,
              })
            : t('dashboard.quality.reason.freshness', { count: daysSinceLast ?? 0 });

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.lg }}>
      <Text variant="overline" tone="muted" accessibilityRole="header">
        {t('dashboard.quality.title')}
      </Text>

      <View
        accessible
        accessibilityLabel={t('dashboard.quality.a11y', {
          score: quality.score,
          level: t(`dashboard.quality.level.${quality.level}`),
          sentence,
        })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}
      >
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.surfaceMuted}
              strokeWidth={STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={levelColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={ringProps}
              // Départ en haut (midi) plutôt qu'à droite.
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <View
            style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {quality.score}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: -2 }}>
              / 100
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Ionicons name={LEVEL_ICON[quality.level]} size={18} color={levelColor} />
            <Text variant="subheading" style={{ color: levelColor }}>
              {t(`dashboard.quality.level.${quality.level}`)}
            </Text>
          </View>
          <Text variant="bodySmall" tone="muted">
            {sentence}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <PartBar
          label={t('dashboard.quality.coverage')}
          value={quality.coverage}
          progress={progress}
          color={levelColor}
        />
        <PartBar
          label={t('dashboard.quality.density')}
          value={quality.density}
          progress={progress}
          color={levelColor}
        />
        <PartBar
          label={t('dashboard.quality.freshness')}
          value={quality.freshness}
          progress={progress}
          color={levelColor}
        />
        <Text variant="caption" tone="muted">
          {t('dashboard.quality.formula')}
        </Text>
      </View>
    </Card>
  );
}
