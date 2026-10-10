// Onglet Accueil = tableau de bord (CDC F3). L2-05 : dernière mesure avec son état (couleur + symbole +
// libellé, seuils du patient), date et heure, indicateur de synchronisation. Tout vient de la base LOCALE :
// l'écran marche sans réseau. Graphique (L2-06), statistiques (L2-07) et qualité des données (L2-08)
// viendront s'ajouter sous la dernière mesure.
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Screen, Text } from '@/components/ui';
import {
  DashboardSkeleton,
  EmptyLatest,
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
            <LatestReading
              latest={state.latest}
              unit={state.unit}
              thresholds={state.thresholds}
              now={state.now}
              index={0}
            />
          ) : (
            <EmptyLatest index={0} />
          )}
          <SyncStatus pending={state.pending} index={1} />
        </>
      ) : null}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
