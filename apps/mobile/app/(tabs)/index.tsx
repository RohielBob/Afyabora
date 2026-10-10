// Onglet Accueil = tableau de bord (CDC F3). L2-05 : dernière mesure avec son état (couleur + symbole +
// libellé, seuils du patient), date et heure, indicateur de synchronisation. L2-06 : graphique d'évolution
// 7/14/30/90 jours avec la bande cible, interactif. Tout vient de la base LOCALE : l'écran marche sans
// réseau. Statistiques (L2-07) et qualité des données (L2-08) viendront s'ajouter sous le graphique.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Screen, Text } from '@/components/ui';
import {
  DashboardSkeleton,
  EmptyLatest,
  GlucoseChart,
  LatestReading,
  SyncStatus,
  greetingKey,
  useDashboard,
} from '@/features/dashboard';
import { MedicalDisclaimer } from '@/features/legal';
import { spacing } from '@/theme';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { state, reload } = useDashboard();
  const now = state.status === 'ready' ? state.now : new Date();
  // « Samedi 10 octobre » : la date du jour, en tête, dans la langue de l'application.
  const today = now.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="overline" tone="primary">
          {today}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t(`dashboard.greeting.${greetingKey(now)}`)}
        </Text>
      </View>

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
                index={1}
              />
            </>
          ) : (
            <EmptyLatest index={0} />
          )}
          <SyncStatus pending={state.pending} index={2} />
        </>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
