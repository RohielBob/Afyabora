// Aucune mesure encore (L2-05) : pas un écran vide, mais une invitation claire à noter la première
// glycémie, avec le rappel qu'elle reste sur le téléphone même sans réseau. Un seul bouton, le principal.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Button, Card, Text } from '@/components/ui';
import { radii, spacing, springs, useReducedMotion, useTheme } from '@/theme';

export function EmptyLatest({ index = 0 }: { index?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <Card variant="outlined" index={index} style={{ alignItems: 'center', gap: spacing.md }}>
      <Animated.View
        entering={
          reduced
            ? undefined
            : ZoomIn.delay(150)
                .springify()
                .damping(springs.bouncy.damping)
                .stiffness(springs.bouncy.stiffness)
        }
        style={{
          width: 64,
          height: 64,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <Ionicons name="water-outline" size={30} color={colors.primaryText} />
      </Animated.View>
      <View style={{ gap: spacing.xs }}>
        <Text variant="heading" align="center" accessibilityRole="header">
          {t('dashboard.empty.title')}
        </Text>
        <Text tone="muted" align="center">
          {t('dashboard.empty.text')}
        </Text>
      </View>
      <Button
        label={t('dashboard.empty.action')}
        fullWidth
        icon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
        onPress={() => router.push('/measurement/new')}
      />
    </Card>
  );
}
