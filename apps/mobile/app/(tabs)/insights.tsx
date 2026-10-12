// Onglet « Analyse » (L3-04, CDC F6) : ce que montrent les mesures, calculé SUR LE TÉLÉPHONE (L8-11, même
// moteur et mêmes phrases que l'API), donc aussi sans réseau.
//  - période 7 / 14 / 30 / 90 jours (30 à l'ouverture, comme le tableau de bord) ;
//  - résumé : temps dans la plage cible, répartition, qualité des données, phrase de synthèse ;
//  - « En bref » : le résumé de la période en langage clair (L3-06), comme dans l'API et le rapport PDF ;
//  - observations triées par gravité, chacune avec « Voir les mesures concernées » (traçabilité) ;
//  - moins de 10 mesures : « pas encore assez de mesures », aucun chiffre trompeur ;
//  - en ligne : les phrases déjà reformulées par l'IA du serveur remplacent celles du téléphone, seulement
//    si elles décrivent exactement les mêmes faits (L3-09) ; hors-ligne, rien ne change ;
//  - une question sur ces chiffres ? accès à l'assistant « Afyabora » (L9-09) ;
//  - avertissement « outil d'aide, pas un avis médical ».
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { InlineAlert, Screen, SegmentedControl, Text } from '@/components/ui';
import { AssistantEntryCard } from '@/features/assistant';
import { CHART_PERIODS, DEFAULT_PERIOD, type ChartPeriod } from '@/features/dashboard';
import {
  AnalysisSkeleton,
  AnalysisSummary,
  InsightCard,
  InsufficientData,
  SummaryCard,
  evidenceOf,
  headlineOf,
  orderInsights,
  useEnrichment,
  useLocalAnalysis,
} from '@/features/insights';
import { MedicalDisclaimer } from '@/features/legal';
import { readUnit } from '@/features/measurements';
import { spacing } from '@/theme';

export default function InsightsScreen() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<ChartPeriod>(DEFAULT_PERIOD);
  const { state, reload } = useLocalAnalysis(period);
  const enrichment = useEnrichment(state.status === 'ready' ? state.analysis : null, period);
  const unit = readUnit();

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;
    const headline = headlineOf(state.analysis, state.points);
    const insights = orderInsights(state.analysis.insights).map((insight) => ({
      insight,
      evidence: evidenceOf(insight, state.points),
      // Position dans l'analyse locale (l'ordre d'affichage est différent) : clé des phrases reprises.
      position: state.analysis.insights.indexOf(insight),
    }));
    return { headline, insights };
  }, [state]);

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {t('insights.title')}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {t('insights.subtitle')}
        </Text>
      </View>

      <SegmentedControl
        accessibilityLabel={t('insights.periodLabel')}
        options={CHART_PERIODS.map((days) => ({
          value: String(days),
          label: t('dashboard.chart.period', { count: days }),
        }))}
        value={String(period)}
        onChange={(value) => setPeriod(Number(value) as ChartPeriod)}
      />

      {state.status === 'loading' ? <AnalysisSkeleton /> : null}

      {state.status === 'error' ? (
        <InlineAlert
          tone="danger"
          message={t('insights.error')}
          actionLabel={t('common.retry')}
          onAction={reload}
        />
      ) : null}

      {state.status === 'ready' && view ? (
        view.headline.kind === 'insufficient' ? (
          <InsufficientData count={view.headline.count} days={state.days} />
        ) : (
          <>
            <AnalysisSummary
              analysis={state.analysis}
              days={state.days}
              headline={view.headline}
              index={0}
            />
            <SummaryCard
              analysis={state.analysis}
              days={state.days}
              index={1}
              rewritten={enrichment.summary}
            />
            {view.insights.length > 0 ? (
              <Text variant="overline" tone="muted" accessibilityRole="header">
                {t('insights.observations', { count: view.insights.length })}
              </Text>
            ) : null}
            {view.insights.map(({ insight, evidence, position }, i) => (
              <InsightCard
                // Clé stable par type et période : changer de période rejoue l'apparition des cartes.
                key={`${state.days}-${insight.type}-${i}`}
                insight={insight}
                evidence={evidence}
                unit={unit}
                thresholds={state.thresholds}
                now={state.now}
                index={i + 2}
                rewritten={enrichment.texts.get(position)}
              />
            ))}
          </>
        )
      ) : null}

      {state.status === 'ready' ? <AssistantEntryCard index={2} /> : null}

      <View style={{ marginTop: 'auto' }}>
        <MedicalDisclaimer variant="compact" />
      </View>
    </Screen>
  );
}
