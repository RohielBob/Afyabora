// Fiches de connaissances de l'assistant (L9-10) : la liste des fiches servies, avec leur relecture par un
// médecin. Appui ⇒ la fiche complète. Hors-ligne : message clair et « Réessayer ».
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Screen, SkeletonCard, Text } from '@/components/ui';
import { BackLink, SheetRow, useSheetList } from '@/features/assistant';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing } from '@/theme';

export default function SheetListScreen() {
  const { t } = useTranslation();
  const { status, items, reload } = useSheetList();
  return (
    <Screen>
      <BackLink fallback="/assistant" />
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('assistant.title')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('assistant.sheets.title')}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {t('assistant.sheets.intro')}
        </Text>
      </View>

      {status === 'loading' ? (
        <View style={{ gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}
      {status === 'offline' ? (
        <InlineAlert
          tone="warning"
          title={t('assistant.load.offlineTitle')}
          message={t('assistant.sheets.offline')}
          actionLabel={t('common.retry')}
          onAction={() => void reload()}
        />
      ) : null}
      {status === 'error' || status === 'notFound' ? (
        <InlineAlert
          tone="danger"
          message={t('assistant.sheets.error')}
          actionLabel={t('common.retry')}
          onAction={() => void reload()}
        />
      ) : null}
      {status === 'ready' && items.length === 0 ? (
        <InlineAlert tone="info" message={t('assistant.sheets.empty')} />
      ) : null}

      {items.map((sheet, i) => (
        <SheetRow key={sheet.id} sheet={sheet} index={i} />
      ))}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
