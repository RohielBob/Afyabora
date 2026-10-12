// Lecteur d'une fiche de connaissances (L9-10) : titre, relecture par un médecin (date) ou « Fiche non
// encore relue », résumé, texte complet (titres, paragraphes, listes, gras), sources officielles (ouvertes
// dans le navigateur), version, et le rappel de parler des décisions avec son professionnel de santé.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { Card, InlineAlert, PressableScale, Screen, SkeletonCard, Text } from '@/components/ui';
import { BackLink, ReviewBadge, SheetBody, parseSheetBody, useSheet } from '@/features/assistant';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing, touchTarget, useTheme } from '@/theme';

export default function SheetScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, sheet, reload } = useSheet(String(id));
  const blocks = useMemo(() => (sheet ? parseSheetBody(sheet.body) : []), [sheet]);

  return (
    <Screen>
      <BackLink fallback="/assistant" />

      {status === 'loading' ? <SkeletonCard /> : null}
      {status === 'offline' ? (
        <InlineAlert
          tone="warning"
          title={t('assistant.load.offlineTitle')}
          message={t('assistant.sheets.offline')}
          actionLabel={t('common.retry')}
          onAction={() => void reload()}
        />
      ) : null}
      {status === 'notFound' ? (
        <InlineAlert tone="info" message={t('assistant.sheets.notFound')} />
      ) : null}
      {status === 'error' ? (
        <InlineAlert
          tone="danger"
          message={t('assistant.sheets.error')}
          actionLabel={t('common.retry')}
          onAction={() => void reload()}
        />
      ) : null}

      {status === 'ready' && sheet ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" tone="primary">
              {t('assistant.sheets.overline')}
            </Text>
            <Text variant="title" accessibilityRole="header">
              {sheet.title}
            </Text>
            <ReviewBadge sheet={sheet} />
          </View>

          <Text variant="subheading" tone="muted">
            {sheet.summary}
          </Text>

          <SheetBody blocks={blocks} />

          <InlineAlert tone="info" message={t('assistant.sheets.reminder')} />

          <Card variant="outlined">
            <Text variant="overline" tone="muted" accessibilityRole="header">
              {t('assistant.sheets.sources', { count: sheet.sources.length })}
            </Text>
            {sheet.sources.map((source) => (
              <PressableScale
                key={source.url}
                accessibilityRole="link"
                accessibilityLabel={source.label}
                accessibilityHint={t('assistant.sheets.sourceHint')}
                onPress={() => void Linking.openURL(source.url)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  minHeight: touchTarget,
                }}
              >
                <Ionicons name="open-outline" size={18} color={colors.primaryText} />
                <Text variant="bodySmall" tone="primary" style={{ flex: 1 }}>
                  {source.label}
                </Text>
              </PressableScale>
            ))}
            <Text variant="caption" tone="subtle">
              {t('assistant.sheets.version', { version: sheet.version })}
            </Text>
          </Card>
        </>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
