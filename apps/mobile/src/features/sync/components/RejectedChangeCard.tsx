// Une modification refusée par le serveur (L8-10) : ce qui a été refusé, la raison donnée par le serveur,
// et le choix de la personne : « Réessayer » ou « Abandonner » (avec confirmation dans la carte : on ne
// supprime rien d'un seul geste).
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { GlucoseUnit } from '@glyka/shared';
import { Button, Card, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import type { RejectedView } from '../rejected';

export function RejectedChangeCard({
  view,
  unit,
  formatValue,
  index,
  onRetry,
  onDiscard,
}: {
  view: RejectedView;
  unit: GlucoseUnit;
  /** Valeur dans l'unité choisie (« 1,48 g/L ») : fournie par l'écran (feature mesures). */
  formatValue: (mgDl: number, unit: GlucoseUnit) => string;
  index: number;
  onRetry: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'retry' | 'discard' | null>(null);

  const date = view.at
    ? new Date(view.at).toLocaleString(i18n.language, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  let what: string;
  if (view.kind === 'measurement') {
    what =
      view.valueMgDl === null
        ? t('sync.screen.gone')
        : t(
            view.action === 'delete'
              ? 'sync.screen.measurementDelete'
              : 'sync.screen.measurementSave',
            {
              value: formatValue(view.valueMgDl, unit),
              date,
            },
          );
  } else {
    what =
      view.eventType === null
        ? t('sync.screen.gone')
        : t(view.action === 'delete' ? 'sync.screen.eventDelete' : 'sync.screen.eventSave', {
            type: t(`event.type.${view.eventType}`),
            label: view.label ?? '',
            date,
          });
  }

  const run = async (kind: 'retry' | 'discard', task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <Card variant="outlined" index={index}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons name="warning-outline" size={20} color={colors.warning} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="bodyStrong">{what}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('sync.screen.reason', { reason: view.reason })}
          </Text>
          <Text variant="caption" tone="subtle">
            {t('sync.screen.attempts', { count: view.attempts })}
          </Text>
        </View>
      </View>

      {confirming ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label">{t('sync.screen.discardTitle')}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('sync.screen.discardText')}
          </Text>
          <Button
            label={t('sync.screen.discardConfirm')}
            variant="danger"
            size="sm"
            loading={busy === 'discard'}
            onPress={() => void run('discard', onDiscard)}
          />
          <Button
            label={t('sync.screen.keep')}
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onPress={() => setConfirming(false)}
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('sync.screen.retry')}
              variant="secondary"
              size="sm"
              loading={busy === 'retry'}
              disabled={busy !== null}
              icon={<Ionicons name="refresh" size={16} color={colors.text} />}
              onPress={() => void run('retry', onRetry)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('sync.screen.discard')}
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onPress={() => setConfirming(true)}
            />
          </View>
        </View>
      )}
    </Card>
  );
}
