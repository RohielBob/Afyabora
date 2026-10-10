// Interrupteur (activé / désactivé) : la pastille glisse avec un ressort doux, le fond prend la couleur
// principale. Toute la ligne (texte compris) est touchable. Accessible comme un « switch ».
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { radii, spacing, springs, touchTarget, useReducedMotion, useTheme } from '@/theme';
import { Text } from './Text';

const WIDTH = 50;
const KNOB = 26;
const PADDING = 3;

export function Toggle({
  value,
  onChange,
  label,
  hint,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = reduced ? (value ? 1 : 0) : withSpring(value ? 1 : 0, springs.gentle);
  }, [value, reduced, progress]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.borderStrong, colors.primary],
    ),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (WIDTH - KNOB - PADDING * 2) }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        minHeight: touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="bodySmall" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Animated.View
        style={[
          { width: WIDTH, height: KNOB + PADDING * 2, borderRadius: radii.pill, padding: PADDING },
          track,
        ]}
      >
        <Animated.View
          style={[
            {
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: '#FFFFFF',
              shadowColor: '#101318',
              shadowOpacity: 0.2,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
