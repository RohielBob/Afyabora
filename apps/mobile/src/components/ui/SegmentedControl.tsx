// Sélecteur à segments (ex. Clair / Sombre / Automatique) : la pastille glisse avec un ressort doux
// vers l'option choisie. Accessible comme un groupe de boutons radio.
import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { radii, spacing, springs, useReducedMotion, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const { colors, mode } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - 8) / options.length : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);

  // La pastille glisse vers l'option choisie quand l'utilisateur change de choix. À l'ouverture de l'écran
  // (première mesure de la largeur), elle est placée directement : pas d'animation que personne n'a demandée.
  useEffect(() => {
    if (segment === 0) return;
    const target = index * segment;
    x.value = !placed.current || reduced ? target : withSpring(target, springs.gentle);
    placed.current = true;
  }, [index, segment, reduced, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radii.md,
        padding: 4,
      }}
    >
      {segment > 0 ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              width: segment,
              borderRadius: radii.sm,
              backgroundColor: mode === 'dark' ? colors.surfaceRaised : colors.surface,
              shadowColor: '#101318',
              shadowOpacity: mode === 'dark' ? 0 : 0.1,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' }}
          >
            <Text variant="label" tone={selected ? 'default' : 'muted'}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
