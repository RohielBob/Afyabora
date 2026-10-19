// Carte d'accès au rapport (L6-03), sous l'analyse : « Préparer ma consultation · Un PDF clair à remettre
// à votre médecin ». Ouvre l'écran du rapport.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

export function ReportEntryCard({ index = 0 }: { index?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      variant="outlined"
      index={index}
      onPress={() => router.push('/report')}
      accessibilityLabel={`${t('report.entry.title')}. ${t('report.entry.body')}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radii.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="subheading">{t('report.entry.title')}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('report.entry.body')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primaryText} />
      </View>
    </Card>
  );
}
