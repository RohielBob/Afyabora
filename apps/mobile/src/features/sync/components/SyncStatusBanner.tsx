// Bandeau de synchronisation de l'Accueil (L8-10, CDC F11) : « Tout est à jour », « 2 mesures en attente
// de synchronisation », « Hors ligne : vos données sont enregistrées sur ce téléphone », problème avec
// « Réessayer », modifications refusées. Toujours une icône ET un texte (jamais la couleur seule) ; les
// états de synchronisation ne sont jamais rouges (rouge = action principale, ADR-0008). Le bandeau ouvre
// l'écran « Synchronisation ».
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, PressableScale, Spinner, Text } from '@/components/ui';
import {
  enterFromBelow,
  radii,
  spacing,
  useReducedMotion,
  useTheme,
  type ThemeColors,
} from '@/theme';
import { syncNow, useSyncState } from '../service';
import {
  lastSyncPhrase,
  nextRetryPhrase,
  pendingPhrase,
  syncStatusView,
  type SyncTone,
} from '../status';
import { formatLocale } from '@/i18n';

/** Icône et couleur de chaque état (la couleur double l'icône et le texte, elle ne les remplace pas). */
export const TONE_ICON: Record<
  Exclude<SyncTone, 'syncing'>,
  { icon: keyof typeof Ionicons.glyphMap; color: keyof ThemeColors }
> = {
  ok: { icon: 'cloud-done-outline', color: 'success' },
  pending: { icon: 'cloud-upload-outline', color: 'info' },
  offline: { icon: 'cloud-offline-outline', color: 'textMuted' },
  problem: { icon: 'alert-circle-outline', color: 'warning' },
};

export function SyncToneIcon({ tone, size = 20 }: { tone: SyncTone; size?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (tone === 'syncing') return <Spinner size={size} label={t('sync.status.syncing')} />;
  const { icon, color } = TONE_ICON[tone];
  return <Ionicons name={icon} size={size} color={colors[color]} />;
}

export function SyncStatusBanner({ index = 0 }: { index?: number }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const view = syncStatusView(useSyncState());
  const now = new Date();
  const pending = pendingPhrase(t, view.pending);
  const details = [
    view.title !== 'pending' ? pending : null,
    view.lastSuccessAt || view.tone === 'ok'
      ? lastSyncPhrase(t, view.lastSuccessAt, now, formatLocale(i18n.language))
      : null,
    view.title === 'pending' ? t('sync.autoSend') : null,
    view.nextRetryAt
      ? nextRetryPhrase(t, view.nextRetryAt, now, formatLocale(i18n.language))
      : null,
  ].filter((line): line is string => Boolean(line));
  const title =
    view.title === 'pending' && pending
      ? pending
      : view.title === 'rejected'
        ? t('sync.status.rejected', { count: view.rejected })
        : t(`sync.status.${view.title}`);

  return (
    <Animated.View entering={enterFromBelow(index, reduced)} style={{ gap: spacing.sm }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={[title, ...details].join('. ')}
        accessibilityHint={t('sync.open')}
        onPress={() => router.push('/sync')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.lg,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <SyncToneIcon tone={view.tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{title}</Text>
          {details.map((line) => (
            <Text key={line} variant="caption" tone="muted">
              {line}
            </Text>
          ))}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      </PressableScale>

      {view.canRetry ? (
        <Button
          label={t('sync.retry')}
          variant="outline"
          size="sm"
          icon={<Ionicons name="refresh" size={16} color={colors.text} />}
          onPress={() => void syncNow()}
        />
      ) : null}

      {view.rejected > 0 && view.title !== 'rejected' ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityHint={t('sync.open')}
          onPress={() => router.push('/sync')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.warning,
          }}
        >
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text variant="bodySmall" style={{ flex: 1 }}>
            {t('sync.rejected', { count: view.rejected })}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}
