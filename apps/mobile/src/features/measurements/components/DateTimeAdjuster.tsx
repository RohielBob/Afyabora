// Date et heure d'une mesure existante (L2-11) : on part de la date d'origine et on l'ajuste —
// jour précédent / suivant, heure par pas de 1 h ou 5 min — jamais dans le futur (bouton désactivé).
// Même langage visuel que le « Quand ? » de la saisie (WhenPicker), sans limite à « avant-hier ».
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import { formatClock } from '../entry';
import { canGoForward, shiftDays, shiftMinutes } from '../edit';
import { formatLocale } from '@/i18n';

export function DateTimeAdjuster({
  at,
  now,
  onChange,
  error,
}: {
  at: Date;
  now: Date;
  onChange: (at: Date) => void;
  error?: string;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();

  const button = (label: string, icon: keyof typeof Ionicons.glyphMap, next: Date, big = false) => {
    const disabled = !canGoForward(next, 0, now);
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(next)}
        style={{
          width: big ? 48 : 40,
          height: big ? 48 : 40,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: big ? colors.primarySoft : colors.surfaceMuted,
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <Ionicons name={icon} size={big ? 22 : 18} color={big ? colors.primaryText : colors.text} />
      </PressableScale>
    );
  };

  const day = at.toLocaleDateString(formatLocale(i18n.language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="muted">
        {t('measurement.edit.whenLabel')}
      </Text>
      <View
        style={{
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t('measurement.edit.day')}
          accessibilityValue={{ text: day }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          {button(t('measurement.edit.previousDay'), 'chevron-back', shiftDays(at, -1))}
          <Text variant="label" align="center" style={{ flex: 1 }}>
            {day.charAt(0).toUpperCase() + day.slice(1)}
          </Text>
          {button(t('measurement.edit.nextDay'), 'chevron-forward', shiftDays(at, 1))}
        </View>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={t('measurement.when.time')}
          accessibilityValue={{ text: formatClock(at.getHours(), at.getMinutes()) }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}
        >
          {button(t('measurement.when.hourMinus'), 'remove', shiftMinutes(at, -60), true)}
          {button(t('measurement.when.minuteMinus'), 'remove', shiftMinutes(at, -5))}
          <Text
            variant="title"
            style={{ minWidth: 96, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          >
            {formatClock(at.getHours(), at.getMinutes())}
          </Text>
          {button(t('measurement.when.minutePlus'), 'add', shiftMinutes(at, 5))}
          {button(t('measurement.when.hourPlus'), 'add', shiftMinutes(at, 60), true)}
        </View>
      </View>
      {error ? (
        <Text variant="bodySmall" tone="danger">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}
