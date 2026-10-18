// Une catégorie à partager (L5-06) : icône, libellé, ce que le médecin verra, et une case à cocher. Toute la
// carte est touchable. L'état « coché » est dit par la case (forme + coche), par la bordure et par le lecteur
// d'écran (case à cocher, cochée ou non), jamais par la couleur seule.
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { PressableScale, Text } from '@/components/ui';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function CategoryOption({
  icon,
  label,
  description,
  checked,
  onToggle,
  note,
}: {
  icon: string;
  label: string;
  /** Ce que le médecin verra avec cette catégorie. */
  description: string;
  checked: boolean;
  onToggle: () => void;
  /** Mise en garde courte quand la catégorie est cochée (ex. notes personnelles). */
  note?: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      // Sur le web, `accessibilityState` ne produit pas `aria-checked` (vérifié dans le navigateur) : on le
      // donne aussi directement, pour que le lecteur d'écran dise « cochée » ou « non cochée ».
      aria-checked={checked}
      accessibilityLabel={`${label}. ${description}`}
      accessibilityHint={checked && note ? note : undefined}
      onPress={onToggle}
      scaleTo="card"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? colors.primary : colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radii.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? colors.primarySoft : colors.surfaceMuted,
        }}
      >
        <Ionicons
          name={icon as IconName}
          size={20}
          color={checked ? colors.primaryText : colors.textMuted}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
        {checked && note ? (
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
            <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
            <Text variant="caption" style={{ flex: 1, color: colors.warning }}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Case : carré vide ou plein avec une coche (forme + couleur). */}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radii.xs,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <Animated.View
            entering={reduced ? undefined : ZoomIn.duration(durations.fast)}
            exiting={reduced ? undefined : ZoomOut.duration(durations.instant)}
          >
            <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
          </Animated.View>
        ) : null}
      </View>
    </PressableScale>
  );
}
