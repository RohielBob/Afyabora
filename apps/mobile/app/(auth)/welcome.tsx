// Écran d'accueil : première impression d'Afyabora. Construit uniquement avec le système de design
// (thème, composants) : il suit automatiquement le thème clair / sombre et la couleur d'accent.
// Entrée en cascade : logo, carte d'exemple, message, puis boutons (≈ 0,5 s au total).
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { LogoMark, Wordmark } from '@/components/brand';
import { Button, Card, RangeBadge, Screen, Text } from '@/components/ui';
import { enterFromBelow, spacing, useReducedMotion, useTheme } from '@/theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <Screen>
      <View style={{ flexGrow: 1, justifyContent: 'space-between', gap: spacing.xl }}>
        <Animated.View entering={enterFromBelow(0, reduced)} style={{ alignItems: 'center' }}>
          <LogoMark size={96} />
          <View style={{ marginTop: spacing.md }}>
            <Wordmark size={36} />
          </View>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('app.tagline')}
          </Text>
        </Animated.View>

        {/* Aperçu d'une carte de suivi (données fictives, signalées comme telles). */}
        <Card index={1} accessibilityLabel={t('welcome.demoA11y')}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text variant="overline" tone="primary">
              {t('welcome.lastMeasurement')}
            </Text>
            <Text
              variant="caption"
              tone="muted"
              style={{
                backgroundColor: colors.surfaceMuted,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              {t('welcome.demoTag')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Text variant="metric">1,12</Text>
            <Text variant="subheading" tone="muted">
              g/L
            </Text>
          </View>
          <RangeBadge state="IN_RANGE" />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              marginTop: spacing.sm,
              paddingTop: spacing.md,
            }}
          >
            <Text variant="caption" tone="muted">
              {t('welcome.offlineSaved')}
            </Text>
            <Text variant="caption" tone="success">
              {t('welcome.onThisPhone')}
            </Text>
          </View>
        </Card>

        <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
          <Text variant="title" align="center">
            {t('welcome.title')}
          </Text>
          <Text tone="muted" align="center">
            {t('welcome.description')}
          </Text>
        </Animated.View>

        <Animated.View entering={enterFromBelow(3, reduced)} style={{ gap: spacing.md }}>
          <Button
            label={t('welcome.createAccount')}
            size="lg"
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <Button
            label={t('welcome.signIn')}
            size="lg"
            variant="outline"
            onPress={() => router.push('/(auth)/sign-in')}
          />
          {/* Avertissement d'usage (exigence du cahier des charges) */}
          <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
            {t('disclaimer')}
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}
