// Badge d'état glycémique : COULEUR + SYMBOLE + LIBELLÉ (jamais la couleur seule).
import { View } from 'react-native';
import { classifyGlucose, STATE_SYMBOLS, type GlucoseThresholds, type GlucoseState } from '@glyka/shared';
import { colors, radii, spacing } from '@/theme';
import { Text } from './Text';

const STATE_COLOR: Record<GlucoseState, string> = {
  VERY_LOW: colors.state.veryLow,
  LOW: colors.state.low,
  IN_RANGE: colors.state.inRange,
  HIGH: colors.state.high,
  VERY_HIGH: colors.state.veryHigh,
};

export function RangeBadge({ mgDl, thresholds }: { mgDl: number; thresholds?: GlucoseThresholds }) {
  const state = classifyGlucose(mgDl, thresholds);
  const { symbol, label } = STATE_SYMBOLS[state];
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: spacing.xs,
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: STATE_COLOR[state],
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{symbol}</Text>
      <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
