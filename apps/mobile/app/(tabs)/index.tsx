// Onglet Accueil = tableau de bord (CDC F3). L2-05 : dernière mesure avec son état (couleur + symbole +
// libellé, seuils du patient), date et heure, indicateur de synchronisation. L2-06 : graphique d'évolution
// 7/14/30/90 jours avec la bande cible, interactif. L2-07 : statistiques et comparaison avec la période
// précédente, pour LA MÊME période que le graphique (changer de période met à jour tous les chiffres).
// L2-08 : score de qualité des données (même période) avec une phrase d'explication.
// Tout vient de la base LOCALE : l'écran marche sans réseau.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Screen, Text } from '@/components/ui';
import {
  DEFAULT_PERIOD,
  DashboardSkeleton,
  EmptyLatest,
  GlucoseChart,
  LatestReading,
  QualityCard,
  StatsCard,
  greetingKey,
  periodQuality,
  periodStats,
  useDashboard,
  type ChartPeriod,
} from '@/features/dashboard';
import { SyncStatusBanner, useSyncRefresh } from '@/features/sync';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing } from '@/theme';
import { formatLocale } from '@/i18n';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { state, reload, refresh } = useDashboard();
  // L8-07 : tirer l'écran vers le bas synchronise, puis le relit sans l'effacer.
  const pull = useSyncRefresh(refresh);
  // Une seule période pour le graphique et les statistiques.
  const [period, setPeriod] = useState<ChartPeriod>(DEFAULT_PERIOD);
  const now = state.status === 'ready' ? state.now : new Date();
  const stats = useMemo(
    () =>
      state.status === 'ready'
        ? periodStats(state.points, period, state.now, state.thresholds)
        : null,
    [state, period],
  );
  const quality = useMemo(
    () => (state.status === 'ready' ? periodQuality(state.points, period, state.now) : null),
    [state, period],
  );
  // « Samedi 10 octobre » : la date du jour, en tête, dans la langue de l'application.
  const today = now.toLocaleDateString(formatLocale(i18n.language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen refresh={pull}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {today}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t(`dashboard.greeting.${greetingKey(now)}`)}
        </Text>
      </View>

      {/* L8-10 : état de la synchronisation EN HAUT (« Hors ligne » se voit sans faire défiler). */}
      <SyncStatusBanner index={0} />

      {state.status === 'loading' ? <DashboardSkeleton /> : null}

      {state.status === 'error' ? (
        <InlineAlert
          tone="danger"
          message={t('dashboard.error')}
          actionLabel={t('common.retry')}
          onAction={reload}
        />
      ) : null}

      {state.status === 'ready' ? (
        <>
          {state.latest ? (
            <>
              <LatestReading
                latest={state.latest}
                unit={state.unit}
                thresholds={state.thresholds}
                now={state.now}
                index={0}
              />
              <GlucoseChart
                points={state.points}
                thresholds={state.thresholds}
                unit={state.unit}
                now={state.now}
                period={period}
                onPeriodChange={setPeriod}
                index={1}
              />
              {stats ? (
                <StatsCard data={stats} period={period} unit={state.unit} index={2} />
              ) : null}
              {quality ? <QualityCard data={quality} period={period} index={3} /> : null}
            </>
          ) : (
            <EmptyLatest index={0} />
          )}
        </>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
