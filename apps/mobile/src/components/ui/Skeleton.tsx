// Squelette de chargement : formes grises qui « respirent » doucement à l'endroit où le contenu va arriver.
// Plus professionnel qu'un écran vide ou qu'un indicateur seul : l'utilisateur voit déjà la mise en page.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: easing.standard }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pulse.value,
      [0, 1],
      [colors.skeleton, colors.skeletonHighlight],
    ),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius }, animatedStyle, style]}
    />
  );
}

/** Squelette d'une carte « dernière mesure » (titre, grande valeur, badge, pied). */
export function SkeletonCard() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radii.lg,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <Skeleton width="38%" height={12} />
      <Skeleton width="55%" height={40} radius={radii.md} />
      <Skeleton width={110} height={24} radius={radii.pill} />
      <Skeleton width="80%" height={12} />
    </View>
  );
}
