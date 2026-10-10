// Choix du type d'événement (L2-10) : trois grandes tuiles faciles à toucher — Repas, Activité, Traitement.
// Chacune : icône + libellé + courte précision ; la tuile choisie est teintée et porte une coche
// (couleur + forme + texte). Accessible comme des boutons radio.
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { LIFE_EVENT_TYPES, type LifeEventType } from '@glyka/shared';
import { PressableScale, Text } from '@/components/ui';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export const EVENT_ICON: Record<LifeEventType, 'restaurant' | 'walk' | 'medkit'> = {
  MEAL: 'restaurant',
  ACTIVITY: 'walk',
  TREATMENT: 'medkit',
};

export function TypeTiles({
  value,
  onChange,
  error,
}: {
  value: LifeEventType | null;
  onChange: (type: LifeEventType) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" tone="muted">
        {t('event.typeLabel')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('event.typeLabel')}
        style={{ flexDirection: 'row', gap: spacing.sm }}
      >
        {LIFE_EVENT_TYPES.map((type) => {
          const selected = type === value;
          return (
            <PressableScale
              key={type}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`event.type.${type}`)}
              accessibilityHint={t(`event.typeHint.${type}`)}
              onPress={() => onChange(type)}
              style={{
                flex: 1,
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xs,
                borderRadius: radii.lg,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : error ? colors.danger : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
              }}
            >
              {selected ? (
                <Animated.View
                  entering={reduced ? undefined : ZoomIn.duration(durations.fast)}
                  style={{ position: 'absolute', top: 6, right: 6 }}
                >
                  <Ionicons name="checkmark-circle" size={16} color={colors.primaryText} />
                </Animated.View>
              ) : null}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.surface : colors.surfaceMuted,
                }}
              >
                <Ionicons
                  name={EVENT_ICON[type]}
                  size={22}
                  color={selected ? colors.primaryText : colors.text}
                />
              </View>
              <Text
                variant="label"
                align="center"
                numberOfLines={1}
                style={{ color: selected ? colors.primaryText : colors.text }}
              >
                {t(`event.type.${type}`)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <Text variant="bodySmall" tone="danger">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}
