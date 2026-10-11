// Une observation (L3-04, CDC F6) : icône du type, titre, gravité (icône + libellé + couleur, jamais la
// couleur seule ni le rouge), la phrase descriptive (« J'observe… », jamais un diagnostic), le seuil franchi
// et, pour une alerte, le rappel de consulter son professionnel de santé. Si des mesures la justifient :
// « Voir les N mesures concernées » déplie la liste (chevron qui tourne, lignes qui apparaissent).
import { Ionicons } from '@expo/vector-icons';
import type { InsightWithText } from '@glyka/analytics';
import type { GlucoseThresholds, GlucoseUnit, InsightSeverity, InsightType } from '@glyka/shared';
import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Card, PressableScale, Text } from '@/components/ui';
import { formatReading, type MeasurementPoint } from '@/features/measurements';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { crossedThreshold, insightSentence } from '../presentation';
import { EvidenceList } from './EvidenceList';
import { RewrittenNote } from './RewrittenNote';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TYPE_ICON: Record<InsightType, IconName> = {
  REPEATED_HYPO: 'trending-down',
  HIGH_STREAK: 'trending-up',
  ANOMALY: 'pulse',
  TIME_OF_DAY_PATTERN: 'time-outline',
  MISSING_DATA: 'calendar-clear-outline',
  PERIOD_COMPARISON: 'swap-horizontal',
  TREND: 'analytics-outline',
};

const SEVERITY_ICON: Record<InsightSeverity, IconName> = {
  INFO: 'information-circle-outline',
  ATTENTION: 'eye-outline',
  ALERT: 'alert-circle',
};

export function InsightCard({
  insight,
  evidence,
  unit,
  thresholds,
  now,
  index = 0,
  rewritten,
}: {
  insight: InsightWithText;
  /** Mesures qui justifient l'observation (déjà retrouvées et triées). */
  evidence: readonly MeasurementPoint[];
  unit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  now: Date;
  index?: number;
  /** Phrase reformulée par le serveur (L3-09), déjà vérifiée ; sinon la phrase des traductions. */
  rewritten?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  // Couleur de la gravité : bleu « information », ambre « à surveiller » et « alerte » (l'alerte se
  // distingue par son icône pleine, son libellé et la bande à gauche). Jamais le rouge de la marque.
  const tone = insight.severity === 'INFO' ? colors.info : colors.warning;
  const severity = t(`insights.severity.${insight.severity}`);
  const title = t(`insights.type.${insight.type}`);
  const sentence = rewritten ?? insightSentence(t, insight);
  const threshold = crossedThreshold(insight);

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = reduced
      ? open
        ? 1
        : 0
      : withTiming(open ? 1 : 0, { duration: durations.base, easing: easing.standard });
  }, [open, reduced, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  return (
    <Card
      variant="outlined"
      index={index}
      style={[
        { gap: spacing.md },
        insight.severity === 'ALERT' ? { borderLeftWidth: 4, borderLeftColor: tone } : null,
      ]}
    >
      <View
        accessible
        accessibilityLabel={t('insights.cardA11y', { severity, title, sentence })}
        style={{ gap: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceMuted,
            }}
          >
            <Ionicons name={TYPE_ICON[insight.type]} size={20} color={tone} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="subheading">{title}</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 4,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: tone,
              }}
            >
              <Ionicons name={SEVERITY_ICON[insight.severity]} size={12} color={tone} />
              <Text variant="caption" style={{ color: tone }}>
                {severity}
              </Text>
            </View>
          </View>
        </View>

        <Text variant="body">{sentence}</Text>
        {rewritten ? <RewrittenNote /> : null}

        {threshold ? (
          <Text variant="caption" tone="muted">
            {t(`insights.threshold.${threshold.direction}`, {
              value: formatReading(threshold.mgDl, unit),
            })}
          </Text>
        ) : null}

        {insight.severity === 'ALERT' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="medkit-outline" size={16} color={colors.textMuted} />
            <Text variant="bodySmall" tone="muted" style={{ flex: 1 }}>
              {t('insights.alertReminder')}
            </Text>
          </View>
        ) : null}
      </View>

      {evidence.length > 0 ? (
        <>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: spacing.xs,
              paddingVertical: spacing.xs,
            }}
          >
            <Text variant="label" tone="primary">
              {open
                ? t('insights.evidence.hide')
                : t('insights.evidence.show', { count: evidence.length })}
            </Text>
            <Animated.View style={chevron}>
              <Ionicons name="chevron-down" size={16} color={colors.primaryText} />
            </Animated.View>
          </PressableScale>
          {open ? (
            <EvidenceList points={evidence} unit={unit} thresholds={thresholds} now={now} />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
