// « En bref » (L3-06, IA-3) : le résumé de la période en langage clair, en haut de l'écran Analyse. Mêmes
// faits et mêmes mots que le résumé de l'API et du rapport PDF (F9) ; calculé sur le téléphone, donc aussi
// sans réseau. Une mention rappelle que ce n'est pas un avis médical. Carte neutre (pas de fond teinté de
// la couleur de la marque, qui ressemblerait à une alerte).
import { Ionicons } from '@expo/vector-icons';
import { summaryFacts, type LastDaysAnalysis } from '@glyka/analytics';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { summaryText } from '../presentation';
import { RewrittenNote } from './RewrittenNote';

export function SummaryCard({
  analysis,
  days,
  index = 0,
  rewritten,
}: {
  analysis: LastDaysAnalysis;
  days: number;
  index?: number;
  /** Résumé reformulé par le serveur (L3-09), déjà vérifié ; sinon le résumé des traductions. */
  rewritten?: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const text = rewritten ?? summaryText(t, summaryFacts(analysis, days));

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Ionicons name="document-text-outline" size={16} color={colors.primaryText} />
        <Text variant="overline" tone="primary" accessibilityRole="header">
          {t('insights.summaryText.title')}
        </Text>
      </View>
      <Text variant="body">{text}</Text>
      {rewritten ? <RewrittenNote /> : null}
      <Text variant="caption" tone="muted">
        {t('insights.summaryText.note')}
      </Text>
    </Card>
  );
}
