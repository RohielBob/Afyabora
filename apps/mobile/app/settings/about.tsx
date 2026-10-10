// Paramètres → À propos (L1-10) : nom et version de l'app, avertissement « outil d'aide, pas un avis
// médical », accès à la politique de confidentialité et à l'avertissement complet, rappel d'urgence.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { LogoMark } from '@/components/brand';
import { Card, InlineAlert, ListRow, Screen, Text } from '@/components/ui';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing, useTheme } from '@/theme';

export default function AboutScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Version lue dans la configuration de l'app (app.config) ; « — » si elle est absente.
  const version = Constants.expoConfig?.version ?? '—';
  const ico = (name: keyof typeof Ionicons.glyphMap) => (
    <Ionicons name={name} size={20} color={colors.primaryText} />
  );

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('legal.about.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('legal.about.title')}
        </Text>
      </View>

      <Card variant="outlined" index={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <LogoMark size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{t('app.name')}</Text>
            <Text variant="bodySmall" tone="muted">
              {t('app.tagline')}
            </Text>
            <Text variant="caption" tone="subtle">
              {t('legal.about.version', { version })}
            </Text>
          </View>
        </View>
      </Card>

      <MedicalDisclaimer index={1} />

      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" tone="muted">
          {t('legal.about.legalTitle')}
        </Text>
        <Card variant="outlined" index={2} style={{ padding: 6, gap: 0 }}>
          <ListRow
            icon={ico('shield-checkmark-outline')}
            title={t('legal.privacy.title')}
            subtitle={t('legal.about.privacyHint')}
            onPress={() => router.push('/legal/privacy')}
          />
          <ListRow
            icon={ico('medkit-outline')}
            title={t('legal.disclaimer.overline')}
            subtitle={t('legal.about.disclaimerHint')}
            onPress={() => router.push('/legal/disclaimer')}
          />
        </Card>
      </View>

      <InlineAlert
        tone="warning"
        title={t('legal.emergencyTitle')}
        message={t('legal.emergency')}
      />

      <Text variant="caption" tone="subtle" align="center">
        {t('legal.about.credits')}
      </Text>
    </Screen>
  );
}
