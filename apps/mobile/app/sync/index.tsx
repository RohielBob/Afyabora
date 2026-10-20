// Écran « Synchronisation » (L8-10, CDC F11) : où en est l'envoi des données du téléphone vers le compte.
// État (icône + texte), données en attente, dernière synchronisation, « Synchroniser maintenant », et les
// modifications REFUSÉES par le serveur avec leur raison : « Réessayer » ou « Abandonner ».
// Ouvert depuis le bandeau de l'Accueil et depuis le Profil.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Card, Screen, Text } from '@/components/ui';
import { formatReading, readUnit } from '@/features/measurements';
import {
  RejectedChangeCard,
  SyncToneIcon,
  describeRejected,
  discardRejectedChange,
  lastSyncPhrase,
  listRejectedChanges,
  pendingPhrase,
  retryRejectedChange,
  syncNow,
  syncStatusView,
  useSyncRefresh,
  useSyncState,
  nextRetryPhrase,
  type RejectedChange,
} from '@/features/sync';
import { spacing, useTheme } from '@/theme';
import { formatLocale } from '@/i18n';

export default function SyncScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const state = useSyncState();
  const view = syncStatusView(state);
  const [rejected, setRejected] = useState<RejectedChange[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadRejected = useCallback(() => {
    listRejectedChanges()
      .then(setRejected)
      .catch(() => setRejected([]));
  }, []);
  useFocusEffect(loadRejected);
  // La liste suit le moteur : un refus de plus après un envoi, un de moins après « Réessayer ».
  useEffect(loadRejected, [loadRejected, state.failedCount, state.lastSuccessAt]);
  const pull = useSyncRefresh(loadRejected);

  const now = new Date();
  const pending = pendingPhrase(t, view.pending);
  const unit = readUnit();

  const syncNowPressed = async () => {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
      loadRejected();
    }
  };

  return (
    <Screen refresh={pull}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {t('sync.screen.overline')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('sync.screen.title')}
        </Text>
        <Text tone="muted">{t('sync.screen.intro')}</Text>
      </View>

      <Card variant="outlined" index={0}>
        <View
          accessible
          accessibilityRole="text"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <SyncToneIcon tone={view.tone} size={28} />
          <Text variant="heading" style={{ flex: 1 }}>
            {view.title === 'rejected'
              ? t('sync.status.rejected', { count: view.rejected })
              : t(`sync.status.${view.title}`)}
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" tone="muted">
              {t('sync.screen.pendingTitle')}
            </Text>
            <Text>{pending ?? t('sync.screen.pendingNone')}</Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="overline" tone="muted">
              {t('sync.screen.lastTitle')}
            </Text>
            <Text>
              {lastSyncPhrase(t, state.lastSuccessAt, now, formatLocale(i18n.language), 'value')}
            </Text>
            {view.nextRetryAt ? (
              <Text variant="bodySmall" tone="muted">
                {nextRetryPhrase(t, view.nextRetryAt, now, formatLocale(i18n.language))}
              </Text>
            ) : null}
          </View>
        </View>

        <Button
          label={t('sync.screen.syncNow')}
          variant="primary"
          loading={syncing || state.status === 'syncing'}
          icon={<Ionicons name="sync" size={20} color={colors.onPrimary} />}
          onPress={() => void syncNowPressed()}
        />
      </Card>

      <View style={{ gap: spacing.md }}>
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {t('sync.screen.rejectedTitle')}
        </Text>
        {rejected.length === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
            <Text tone="muted">{t('sync.screen.noRejected')}</Text>
          </View>
        ) : (
          <>
            <Text variant="bodySmall" tone="muted">
              {t('sync.screen.rejectedIntro')}
            </Text>
            {rejected.map((change, i) => (
              <RejectedChangeCard
                key={change.opId}
                view={describeRejected(change)}
                unit={unit}
                formatValue={formatReading}
                index={i + 1}
                onRetry={async () => {
                  await retryRejectedChange(change.opId);
                  loadRejected();
                }}
                onDiscard={async () => {
                  await discardRejectedChange(change.opId);
                  loadRejected();
                }}
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
