// Bandeau de message dans la page (erreur, information, succès, attention) : icône + texte + action
// facultative. Il apparaît en fondu et il est annoncé par le lecteur d'écran.
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { Text } from './Text';

export type AlertTone = 'danger' | 'info' | 'success' | 'warning';

const ICON: Record<AlertTone, keyof typeof Ionicons.glyphMap> = {
  danger: 'alert-circle',
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
};

export function InlineAlert({
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: {
  tone: AlertTone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, mode } = useTheme();
  const reduced = useReducedMotion();
  const fg = colors[tone];
  // Fond très léger de la même couleur que le message (≈ 8 % en clair, 14 % en sombre).
  const bg = tone === 'danger' ? colors.dangerSoft : `${fg}${mode === 'dark' ? '24' : '14'}`;

  return (
    <Animated.View entering={enterFromBelow(0, reduced)}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.md + 2,
          borderRadius: radii.md,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: `${fg}40`,
        }}
      >
        <Ionicons name={ICON[tone]} size={22} color={fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 2 }}>
          {title ? (
            <Text variant="label" style={{ color: fg }}>
              {title}
            </Text>
          ) : null}
          <Text variant="bodySmall">{message}</Text>
          {actionLabel && onAction ? (
            <Text
              variant="label"
              tone="primary"
              accessibilityRole="link"
              onPress={onAction}
              style={{ marginTop: spacing.xs, textDecorationLine: 'underline' }}
            >
              {actionLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
