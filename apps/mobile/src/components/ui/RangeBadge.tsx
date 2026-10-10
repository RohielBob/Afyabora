// Badge d'état glycémique : COULEUR + SYMBOLE + LIBELLÉ (jamais la couleur seule).
// Palette des états SANS rouge (ADR-0008) : le rouge est la couleur de la marque, pas une alarme.
// Les états extrêmes (très bas / très haut) sont pleins et contrastés ; les autres sont doux.
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import {
  classifyGlucose,
  STATE_SYMBOLS,
  type GlucoseState,
  type GlucoseThresholds,
} from '@glyka/shared';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import { Text } from './Text';

export interface RangeBadgeProps {
  /** Valeur en mg/dL (l'état est calculé avec les seuils) … */
  mgDl?: number;
  thresholds?: GlucoseThresholds;
  /** … ou état déjà connu. */
  state?: GlucoseState;
  size?: 'sm' | 'md';
}

export function RangeBadge({ mgDl, thresholds, state, size = 'md' }: RangeBadgeProps) {
  const { states } = useTheme();
  const reduced = useReducedMotion();
  const current: GlucoseState = state ?? classifyGlucose(mgDl ?? 0, thresholds);
  const { symbol, label } = STATE_SYMBOLS[current];
  const c = states[current];

  return (
    <Animated.View
      // Petite apparition « posée » quand l'état change (key) : l'œil remarque le nouvel état.
      key={current}
      entering={reduced ? undefined : ZoomIn.duration(durations.base).easing(easing.decelerate)}
      style={{ alignSelf: 'flex-start' }}
    >
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`État : ${label}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs + 2,
          backgroundColor: c.bg,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: radii.pill,
          paddingHorizontal: size === 'sm' ? spacing.sm + 2 : spacing.md,
          paddingVertical: size === 'sm' ? 2 : spacing.xs + 1,
        }}
      >
        <Text variant="caption" style={{ color: c.fg, fontSize: size === 'sm' ? 10 : 11 }}>
          {symbol}
        </Text>
        <Text variant={size === 'sm' ? 'caption' : 'label'} style={{ color: c.fg }}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}
