// Pastille de couleur d'accent (Réglages → Apparence). La pastille choisie est entourée d'un anneau
// et porte une coche ; la sélection s'anime avec un léger ressort.
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { radii, spacing, springs } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function ColorSwatch({
  color,
  label,
  selected,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1 : 0.86, springs.gentle) }],
    opacity: withSpring(selected ? 1 : 0, springs.gentle),
  }));

  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // Sur le web, `accessibilityState` ne produit pas `aria-checked` (vérifié dans le navigateur) : on le
      // donne aussi directement, pour que le lecteur d'écran dise quelle couleur est choisie.
      aria-checked={selected}
      accessibilityLabel={`Couleur ${label}`}
      onPress={onPress}
      style={{ alignItems: 'center', gap: spacing.xs + 2, width: 72 }}
    >
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 56,
              height: 56,
              borderRadius: radii.pill,
              borderWidth: 2,
              borderColor: color,
            },
            ringStyle,
          ]}
        />
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: radii.pill,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? (
            <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
              ✓
            </Text>
          ) : null}
        </View>
      </View>
      <Text variant="caption" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </PressableScale>
  );
}
