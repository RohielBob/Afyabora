// « Préparer ma consultation » (L6-03, CDC F9) : le patient choisit la période (14 / 30 / 90 jours), voit
// ce que contiendra le rapport, puis « Créer et partager le PDF » : le serveur fabrique le PDF (L6-02) et
// le partage du système s'ouvre (WhatsApp, e-mail, Fichiers, imprimer…).
//  - aperçu : les chiffres de la période calculés sur le téléphone, par le même moteur que le serveur
//    (CDC F9 : « les chiffres du PDF sont identiques à ceux du tableau de bord ») ;
//  - les mesures pas encore envoyées partent avant la création ; celles qui n'ont pas pu partir sont
//    annoncées (elles ne sont pas dans le PDF) ;
//  - le réseau est nécessaire : sans lui, message clair tout de suite ;
//  - le médecin peut aussi le télécharger lui-même si le patient coche « Rapport PDF » en partageant.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Button,
  Card,
  InlineAlert,
  ListRow,
  PressableScale,
  Screen,
  SegmentedControl,
  Text,
} from '@/components/ui';
import {
  AnalysisSkeleton,
  AnalysisSummary,
  headlineOf,
  useLocalAnalysis,
} from '@/features/insights';
import { MedicalDisclaimer } from '@/features/legal';
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  ReportContents,
  useReport,
  type ReportPeriod,
  type ReportProblem,
} from '@/features/report';
import { enterFromBelow, radii, spacing, useReducedMotion, useTheme } from '@/theme';

export default function ReportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [period, setPeriod] = useState<ReportPeriod>(DEFAULT_REPORT_PERIOD);
  const { state: local } = useLocalAnalysis(period);
  const report = useReport();
  const { state } = report;
  const working = state.status === 'working';

  const headline = useMemo(
    () => (local.status === 'ready' ? headlineOf(local.analysis, local.points) : null),
    [local],
  );
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/insights'));

  return (
    <Screen>
      {/* En-tête : titre + fermer. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="overline" tone="primary">
            {t('report.overline')}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('report.title')}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('report.close')}
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
      <Text tone="muted">{t('report.intro')}</Text>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading" accessibilityRole="header">
          {t('report.period')}
        </Text>
        <SegmentedControl
          accessibilityLabel={t('report.period')}
          options={REPORT_PERIODS.map((days) => ({
            value: String(days),
            label: t('dashboard.chart.period', { count: days }),
          }))}
          value={String(period)}
          onChange={(value) => {
            if (working) return;
            setPeriod(Number(value) as ReportPeriod);
            report.reset(); // le rapport déjà créé était pour une autre période
          }}
        />
      </View>

      {/* Aperçu : les chiffres de la période, comme dans « Analyse ». */}
      {local.status === 'loading' ? <AnalysisSkeleton /> : null}
      {local.status === 'ready' && headline ? (
        headline.kind === 'insufficient' ? (
          <InlineAlert
            tone="info"
            title={t('report.few.title')}
            message={t('report.few.text', { count: headline.count, days: period })}
          />
        ) : (
          <AnalysisSummary analysis={local.analysis} days={period} headline={headline} index={0} />
        )
      ) : null}

      <ReportContents index={1} />

      {report.pendingMeasurements > 0 && state.status === 'idle' ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Ionicons
            name="cloud-upload-outline"
            size={14}
            color={colors.textMuted}
            style={{ marginTop: 2 }}
          />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            {t('report.pending', { count: report.pendingMeasurements })}
          </Text>
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <ProblemAlert problem={state.problem} onRetry={() => void report.create(period)} />
      ) : null}

      {state.status === 'done' ? (
        <InlineAlert
          tone="success"
          title={t('report.done.title')}
          message={t('report.done.text', { filename: state.saved.filename })}
        />
      ) : null}

      {(state.status === 'done' || state.status === 'failed') && state.unsent > 0 ? (
        <InlineAlert
          tone="warning"
          title={t('report.unsent.title', { count: state.unsent })}
          message={t('report.unsent.text', { count: state.unsent })}
        />
      ) : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
        {state.status === 'done' ? (
          <>
            <Button
              label={t('report.shareAgain')}
              size="lg"
              icon={<Ionicons name="share-outline" size={20} color={colors.onPrimary} />}
              onPress={() => void report.shareAgain()}
            />
            <Button
              label={t('report.createAgain')}
              variant="outline"
              icon={<Ionicons name="refresh" size={18} color={colors.primaryText} />}
              onPress={() => void report.create(period)}
            />
          </>
        ) : (
          <Button
            label={t('report.create')}
            size="lg"
            loading={working}
            icon={<Ionicons name="document-text-outline" size={20} color={colors.onPrimary} />}
            onPress={() => void report.create(period)}
          />
        )}
        {working ? (
          <Text
            variant="caption"
            tone="muted"
            accessibilityLiveRegion="polite"
            style={{ textAlign: 'center' }}
          >
            {t(`report.phase.${state.phase}`)}
          </Text>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.xs,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="wifi-outline" size={14} color={colors.textMuted} />
            <Text variant="caption" tone="muted">
              {t('report.network')}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Le médecin peut aussi le télécharger lui-même, si le patient le permet en partageant. */}
      <Card variant="outlined" index={3} style={{ padding: 6, gap: 0 }}>
        <ListRow
          icon={<Ionicons name="qr-code-outline" size={20} color={colors.primaryText} />}
          title={t('report.doctor.title')}
          subtitle={t('report.doctor.text')}
          onPress={() => router.push('/share/new')}
        />
      </Card>

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}

/** Échec : explication, et « Réessayer » quand réessayer a un sens. */
function ProblemAlert({ problem, onRetry }: { problem: ReportProblem; onRetry: () => void }) {
  const { t } = useTranslation();
  // Profil absent ou partage indisponible sur l'appareil : réessayer ne changerait rien.
  const retry =
    problem.kind === 'noProfile' || problem.kind === 'cannotShare'
      ? {}
      : { actionLabel: t('common.retry'), onAction: onRetry };
  return (
    <InlineAlert
      tone={problem.kind === 'error' ? 'danger' : 'warning'}
      title={t(`report.problem.${problem.kind}.title`)}
      message={t(`report.problem.${problem.kind}.text`)}
      {...retry}
    />
  );
}
