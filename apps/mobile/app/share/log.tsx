// « Qui a consulté mes données » (L5-09, CDC F7 « Journal d'accès ») : chaque médecin qui a eu accès au
// dossier, quand, combien de temps, et comment l'accès a pris fin (log.ts regroupe le journal de
// GET /shares/log en visites). Lecture seule : personne ne peut modifier ce journal.
//  - Pages de 500 lignes ; « Voir plus » charge les suivantes (une visite coupée entre deux pages est
//    recomposée). Tirer pour rafraîchir.
//  - Pas de réseau : message et « Réessayer » ; ce qui est déjà affiché reste.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { AccessLogEntry } from '@glyka/shared';
import {
  Button,
  Card,
  InlineAlert,
  PressableScale,
  Screen,
  SkeletonCard,
  Text,
} from '@/components/ui';
import { VisitCard, buildVisits, sharingApi } from '@/features/sharing';
import { ApiError } from '@/lib/api-client';
import { radii, spacing, useTheme } from '@/theme';

type Problem = 'offline' | 'error';

export default function ShareLogScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const problemOf = (error: unknown): Problem =>
    error instanceof ApiError && error.status === 0 ? 'offline' : 'error';

  /** Première page (au départ, en tirant pour rafraîchir, ou après « Réessayer »). */
  const loadFirst = useCallback(async () => {
    setProblem(null);
    try {
      const page = await sharingApi.log();
      setEntries(page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      setProblem(problemOf(error));
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setProblem(null);
    try {
      const page = await sharingApi.log(cursor);
      setEntries((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      setProblem(problemOf(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const visits = useMemo(() => (entries ? buildVisits(entries) : []), [entries]);
  const now = new Date();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/share'));

  return (
    <Screen
      refresh={{
        refreshing,
        onRefresh: () => {
          setRefreshing(true);
          void loadFirst().finally(() => setRefreshing(false));
        },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('share.log.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('share.log.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('share.log.close')}
          onPress={close}
          style={{
            width: 44,
            height: 44,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </PressableScale>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
        <Ionicons
          name="lock-closed-outline"
          size={16}
          color={colors.textMuted}
          style={{ marginTop: 3 }}
        />
        <Text tone="muted" style={{ flex: 1 }}>
          {t('share.log.intro')}
        </Text>
      </View>

      {problem ? (
        <InlineAlert
          tone={problem === 'offline' ? 'warning' : 'danger'}
          title={t(`share.log.problem.${problem}.title`)}
          message={t(`share.log.problem.${problem}.text`)}
          actionLabel={t('common.retry')}
          onAction={() => void (entries && cursor ? loadMore() : loadFirst())}
        />
      ) : null}

      {entries === null && !problem ? (
        <View accessibilityLabel={t('share.log.loading')} style={{ gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {entries !== null && visits.length === 0 ? (
        <Card variant="outlined" index={0} style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="shield-checkmark-outline" size={32} color={colors.primaryText} />
          <Text variant="bodyStrong" align="center">
            {t('share.log.empty.title')}
          </Text>
          <Text tone="muted" align="center">
            {t('share.log.empty.text')}
          </Text>
        </Card>
      ) : null}

      {visits.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="caption" tone="muted">
            {t('share.log.count', { count: visits.length })}
          </Text>
          {visits.map((visit, index) => (
            <VisitCard key={visit.key} visit={visit} index={Math.min(index, 8)} now={now} />
          ))}
        </View>
      ) : null}

      {cursor && entries !== null ? (
        <Button
          label={t('share.log.more')}
          variant="secondary"
          loading={loadingMore}
          onPress={() => void loadMore()}
        />
      ) : null}
    </Screen>
  );
}
