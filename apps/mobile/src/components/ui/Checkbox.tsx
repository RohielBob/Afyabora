// Case à cocher (ex. consentement) : jamais pré-cochée par défaut ; la coche apparaît avec un léger ressort.
// Toute la ligne (case + texte) est touchable. Peut afficher une erreur sous le texte.
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { durations, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { Text } from './Text';

export function Checkbox({
  checked,
  onChange,
  label,
  error,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texte (ou contenu riche) à droite de la case. */
  label: ReactNode;
  error?: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const border = error ? colors.danger : checked ? colors.primary : colors.borderStrong;

  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={error}
        onPress={() => onChange(!checked)}
        hitSlop={6}
        style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            marginTop: 1,
            borderRadius: radii.xs,
            borderWidth: 2,
            borderColor: border,
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
        <View style={{ flex: 1 }}>
          {typeof label === 'string' ? <Text variant="bodySmall">{label}</Text> : label}
        </View>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" style={{ marginLeft: 24 + spacing.md }}>
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  );
}
