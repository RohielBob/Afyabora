// Moins de 10 mesures sur la période (CDC §5.3 : « l'analyse le dit et s'arrête là ») : on explique combien
// il y en a, combien il en faut, et on propose de noter une mesure. Aucun chiffre trompeur.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

export function InsufficientData({
  count,
  days,
  index = 0,
}: {
  count: number;
  days: number;
  index?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radii.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name="hourglass-outline" size={20} color={colors.textMuted} />
        </View>
        <Text variant="subheading" style={{ flex: 1 }} accessibilityRole="header">
          {t('insights.insufficient.title')}
        </Text>
      </View>
      <Text variant="body" tone="muted">
        {t('insights.insufficient.body', { count, days })}
      </Text>
      <Button
        label={t('insights.insufficient.action')}
        variant="secondary"
        icon={<Ionicons name="add" size={18} color={colors.primaryText} />}
        onPress={() => router.push('/measurement/new')}
      />
    </Card>
  );
}
