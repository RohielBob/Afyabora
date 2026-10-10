// « Quand ? » (L2-03) : maintenant par défaut, deux raccourcis (−30 min, −1 h), ou « Autre » qui ouvre en
// douceur un choix du jour (aujourd'hui, hier, avant-hier) et de l'heure, réglable par pas de 1 h ou de
// 5 min. Pas de sélecteur de date natif : ce serait une dépendance de plus, et ces boutons suffisent pour
// noter une mesure récente en quelques secondes.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { PressableScale, SegmentedControl, Text } from '@/components/ui';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import {
  WHEN_PRESETS,
  formatClock,
  shiftTime,
  type DayOffset,
  type WhenPreset,
  type WhenState,
} from '../entry';

const DAYS: { value: `${DayOffset}`; key: string }[] = [
  { value: '2', key: 'dayBefore' },
  { value: '1', key: 'yesterday' },
  { value: '0', key: 'today' },
];

export function WhenPicker({
  when,
  onChange,
  error,
}: {
  when: WhenState;
  onChange: (when: WhenState) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  const step = (minutes: number, label: string, icon: 'remove' | 'add', big = false) => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onChange(shiftTime(when, minutes))}
      style={{
        width: big ? 48 : 40,
        height: big ? 48 : 40,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: big ? colors.primarySoft : colors.surfaceMuted,
      }}
    >
      <Ionicons name={icon} size={big ? 22 : 18} color={big ? colors.primaryText : colors.text} />
    </PressableScale>
  );

  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.duration(durations.base)}
      style={{ gap: spacing.sm }}
    >
      <Text variant="label" tone="muted">
        {t('measurement.when.label')}
      </Text>
      <SegmentedControl<WhenPreset>
        accessibilityLabel={t('measurement.when.label')}
        value={when.preset}
        onChange={(preset) => onChange({ ...when, preset })}
        options={WHEN_PRESETS.map((value) => ({ value, label: t(`measurement.when.${value}`) }))}
      />

      {when.preset === 'custom' ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(durations.base)}
          exiting={reduced ? undefined : FadeOut.duration(durations.fast)}
          style={{
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <SegmentedControl<`${DayOffset}`>
            accessibilityLabel={t('measurement.when.label')}
            value={`${when.day}`}
            onChange={(day) => onChange({ ...when, day: Number(day) as DayOffset })}
            options={DAYS.map((d) => ({ value: d.value, label: t(`measurement.when.${d.key}`) }))}
          />
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={t('measurement.when.time')}
            accessibilityValue={{ text: formatClock(when.hour, when.minute) }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
            }}
          >
            {step(-60, t('measurement.when.hourMinus'), 'remove', true)}
            {step(-5, t('measurement.when.minuteMinus'), 'remove')}
            <Text
              variant="title"
              style={{ minWidth: 96, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            >
              {formatClock(when.hour, when.minute)}
            </Text>
            {step(5, t('measurement.when.minutePlus'), 'add')}
            {step(60, t('measurement.when.hourPlus'), 'add', true)}
          </View>
        </Animated.View>
      ) : null}

      {error ? (
        <Text variant="bodySmall" tone="danger">
          ⚠ {error}
        </Text>
      ) : null}
    </Animated.View>
  );
}
