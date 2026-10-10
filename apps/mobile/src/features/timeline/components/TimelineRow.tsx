// Une ligne de la chronologie (CDC F4 : « chaque ligne porte un icône + un texte, pas la couleur seule »).
//  - à gauche : l'heure ; puis une pastille avec l'icône du type (goutte, couvert, marche, trousse) ;
//  - mesure : valeur dans l'unité du patient + badge d'état (couleur + symbole + libellé), contexte,
//    provenance (saisie, import + lot, appareil), note éventuelle, « pas encore envoyée » ;
//  - événement : libellé, type (+ durée pour une activité), détails ; traitement : « déclaré par vous »
//    (jamais de calcul de dose, CDC).
// Les lignes d'un même jour forment une carte : bords arrondis en haut de la première, en bas de la dernière.
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { classifyGlucose, type GlucoseThresholds, type GlucoseUnit } from '@glyka/shared';
import { RangeBadge, Text } from '@/components/ui';
import { formatClock, formatReading } from '@/features/measurements';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import type { TimelineItem } from '../timeline';
import { FILTER_ICON } from './FilterChips';
import { ProvenanceBadge } from './ProvenanceBadge';

export function TimelineRow({
  item,
  unit,
  thresholds,
  first,
  last,
  index,
}: {
  item: TimelineItem;
  unit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  first: boolean;
  last: boolean;
  /** Rang d'apparition (les premières lignes entrent l'une après l'autre). */
  index: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const date = new Date(item.at);
  const time = formatClock(date.getHours(), date.getMinutes());
  const icon = item.kind === 'measurement' ? FILTER_ICON.glucose : FILTER_ICON[item.type];

  let a11y: string;
  let body: ReactNode;
  if (item.kind === 'measurement') {
    const value = formatReading(item.mgDl, unit);
    const state = classifyGlucose(item.mgDl, thresholds);
    const context = t(`measurement.context.${item.context}`);
    a11y = t('timeline.a11y.measurement', {
      time,
      value,
      state: t(`glucose.state.${state}`),
      context,
    });
    body = (
      <>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}
        >
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>
            {value}
          </Text>
          <RangeBadge state={state} size="sm" />
        </View>
        <Text variant="bodySmall" tone="muted">
          {context}
        </Text>
        {item.note ? (
          <Text variant="bodySmall" numberOfLines={2} style={{ fontStyle: 'italic' }}>
            « {item.note} »
          </Text>
        ) : null}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}
        >
          <ProvenanceBadge source={item.source} importBatchId={item.importBatchId} />
          {item.pendingSync ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="cloud-upload-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
                {t('timeline.pending')}
              </Text>
            </View>
          ) : null}
        </View>
      </>
    );
  } else {
    const typeLabel = t(`timeline.type.${item.type}`);
    const meta =
      item.durationMinutes !== null
        ? t('timeline.duration', { type: typeLabel, count: item.durationMinutes })
        : typeLabel;
    a11y = t('timeline.a11y.event', { time, label: item.label, meta });
    body = (
      <>
        <Text variant="subheading" numberOfLines={2}>
          {item.label}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {meta}
        </Text>
        {item.details ? (
          <Text variant="bodySmall" numberOfLines={3}>
            {item.details}
          </Text>
        ) : null}
        {item.type === 'TREATMENT' ? (
          <Text variant="caption" tone="muted">
            {t('timeline.declared')}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <Animated.View entering={index < 10 ? enterFromBelow(index, reduced) : undefined}>
      <View
        accessible
        accessibilityLabel={a11y}
        style={{
          flexDirection: 'row',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          backgroundColor: colors.surface,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderTopWidth: first ? 1 : 0,
          borderBottomWidth: 1,
          borderColor: colors.border,
          borderTopLeftRadius: first ? radii.lg : 0,
          borderTopRightRadius: first ? radii.lg : 0,
          borderBottomLeftRadius: last ? radii.lg : 0,
          borderBottomRightRadius: last ? radii.lg : 0,
        }}
      >
        <Text
          variant="label"
          tone="muted"
          style={{ width: 44, paddingTop: 2, fontVariant: ['tabular-nums'] }}
        >
          {time}
        </Text>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name={icon} size={16} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>{body}</View>
      </View>
    </Animated.View>
  );
}
