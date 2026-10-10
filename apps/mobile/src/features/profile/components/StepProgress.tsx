// Progression de l'assistant : « Étape 2 sur 4 » + titre de l'étape + barre qui se remplit en douceur.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export function StepProgress({
  current,
  total,
  title,
}: {
  current: number;
  total: number;
  title: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    const target = current / total;
    progress.value = reduced
      ? target
      : withTiming(target, { duration: durations.slow, easing: easing.standard });
  }, [current, total, progress, reduced]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      style={{ gap: spacing.sm }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('onboarding.progress', { current, total })}
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      <Text variant="overline" tone="primary">
        {t('onboarding.progress', { current, total })}
      </Text>
      <View
        style={{
          height: 6,
          borderRadius: radii.pill,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
            fill,
          ]}
        />
      </View>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
        {title}
      </Text>
    </View>
  );
}
