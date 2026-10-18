// Dossier patient (L5-12, CDC F8) : ce que le patient a partagé, en onglets, en lecture seule.
//  - Onglets : seulement ceux des catégories partagées (tabsFor) ; l'onglet choisi est dans l'adresse
//    (`?onglet=glycemie`… : un rechargement garde l'onglet).
//  - Données : résumé (toujours), mesures (onglet Glycémie), chronologie (Chronologie, Traitements,
//    Nutrition, Activité : une seule lecture pour les quatre), sur la période choisie (7 à 90 jours).
//    L'unité est celle du patient, modifiable (g/L, mg/dL, mmol/L) : la valeur en base ne change pas.
//  - FIN D'ACCÈS (CDC F8 : « à l'expiration, les données disparaissent de l'écran et un rechargement ne
//    les ramène pas ») : dès qu'une réponse dit « expiré », « arrêté », « compte non approuvé » ou « pas
//    votre dossier », TOUT le dossier est effacé de la mémoire et un message le remplace. Le résumé est
//    relu toutes les 30 s et à l'heure de fin donnée par le serveur, pour s'en apercevoir sans attendre un
//    clic. Le serveur reste la seule autorité : il refuse chaque requête après la fin.
//  - Les données ne sont jamais gardées en cache après avoir quitté la page (gcTime 0) ni stockées.
//  - Chaque lecture est enregistrée côté serveur dans le journal du patient (une ligne par moment de
//    lecture, pas par requête : module `doctor` de l'API).
// Le bandeau de compte à rebours et l'écran « Accès expiré » arrivent avec L5-13.
import { UNIT_LABELS, type GlucoseUnit } from '@glyka/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink, Segmented, Spinner } from '@/components/ui';
import { recordApi } from '@/features/patient-record/api';
import { RecordHeader } from '@/features/patient-record/RecordHeader';
import { RecordTabs, TabPanel } from '@/features/patient-record/RecordTabs';
import { GlucoseTab } from '@/features/patient-record/tabs/GlucoseTab';
import { OverviewTab } from '@/features/patient-record/tabs/OverviewTab';
import { SummaryTab } from '@/features/patient-record/tabs/SummaryTab';
import { TimelineTab } from '@/features/patient-record/tabs/TimelineTab';
import {
  DEFAULT_PERIOD,
  PERIODS,
  periodStart,
  pickTab,
  recordProblem,
  TAB_KIND,
  tabsFor,
  UNITS,
  type EndReason,
  type PeriodDays,
  type RecordTab,
} from '@/features/patient-record/view';
import { fill, fr } from '@/i18n/fr';

/** Relecture du résumé : un arrêt par le patient est vu en 30 s au plus. */
export const RECORD_REFRESH_MS = 30_000;

/** Nom de chaque onglet dans l'adresse (`?onglet=…`). */
const TAB_PARAM: Record<RecordTab, string> = {
  overview: 'resume',
  glucose: 'glycemie',
  timeline: 'chronologie',
  treatments: 'traitements',
  meals: 'nutrition',
  activity: 'activite',
  summary: 'analyses',
};
const tabFromParam = (value: string | null) =>
  (Object.entries(TAB_PARAM).find(([, param]) => param === value)?.[0] ?? null) as string | null;

const TIMELINE_TABS: readonly RecordTab[] = ['timeline', 'treatments', 'meals', 'activity'];

/** Pas de nouvel essai sur un refus (403, 404) : seulement une fois sur un problème de réseau. */
const retry = (count: number, error: unknown) =>
  recordProblem(error).kind === 'network' && count < 1;

function Ended({ reason }: { reason: EndReason }) {
  const text = fr.record.ended[reason];
  return (
    <section className="animate-enter mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <h1 className="text-[22px] font-bold text-ink">{text.title}</h1>
      <p className="text-[15px] text-muted">{text.text}</p>
      <ButtonLink to="/patients" className="sm:w-auto sm:min-w-[240px]">
        {fr.record.ended.back}
      </ButtonLink>
    </section>
  );
}

function Problem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = recordProblem(error).kind === 'network';
  const text = offline ? fr.record.problem.network : fr.record.problem.server;
  return (
    <Alert tone={offline ? 'warning' : 'danger'} title={text.title}>
      <span className="flex flex-col items-start gap-3">
        {text.text}
        <Button variant="outline" fullWidth={false} onClick={onRetry}>
          {fr.record.retry}
        </Button>
      </span>
    </Alert>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-3 text-[14px] text-muted">
      <Spinner size={20} />
      {fr.common.loading}
    </div>
  );
}

export default function PatientRecordRoute() {
  const { sessionId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [period, setPeriod] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [unitChoice, setUnitChoice] = useState<GlucoseUnit | null>(null);
  const key = ['record', sessionId] as const;

  const summary = useQuery({
    queryKey: [...key, 'summary'],
    queryFn: () => recordApi.summary(sessionId),
    enabled: !ended,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: RECORD_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry,
  });
  const categories = summary.data?.session.categories ?? [];
  const tabs = tabsFor(categories);
  const tab = pickTab(tabFromParam(params.get('onglet')), tabs);
  const unit = unitChoice ?? summary.data?.patient.preferredUnit ?? 'G_L';

  const measurements = useQuery({
    queryKey: [...key, 'measurements', period],
    queryFn: () => recordApi.measurements(sessionId, periodStart(period, new Date())),
    enabled: !ended && !!summary.data && tab === 'glucose',
    staleTime: 60_000,
    gcTime: 0,
    retry,
  });
  const timeline = useQuery({
    queryKey: [...key, 'timeline', period],
    queryFn: () => recordApi.timeline(sessionId, periodStart(period, new Date())),
    enabled: !ended && !!summary.data && TIMELINE_TABS.includes(tab),
    staleTime: 60_000,
    gcTime: 0,
    retry,
  });

  // Fin d'accès vue dans N'IMPORTE quelle réponse : tout le dossier est effacé de la mémoire.
  let reason: EndReason | null = null;
  for (const error of [summary.error, measurements.error, timeline.error]) {
    const problem = error ? recordProblem(error) : null;
    if (problem?.kind === 'ended') reason = problem.reason;
  }
  useEffect(() => {
    if (!reason) return;
    setEnded(reason);
    queryClient.removeQueries({ queryKey: ['record', sessionId] });
  }, [reason, queryClient, sessionId]);

  // À l'heure de fin donnée par le SERVEUR : relire le résumé. Le serveur dit alors « expiré » (et tout est
  // effacé) ; si l'horloge de l'ordinateur est en avance, la relecture toutes les 30 s prend le relais.
  const expiresAt = summary.data?.session.expiresAt ?? null;
  useEffect(() => {
    if (!expiresAt || ended) return;
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: ['record', sessionId, 'summary'] }),
      Math.max(0, Date.parse(expiresAt) - Date.now()) + 1000,
    );
    return () => clearTimeout(timer);
  }, [expiresAt, ended, queryClient, sessionId]);

  if (ended) return <Ended reason={ended} />;

  const now = new Date();
  const to = now.getTime();
  const from = Date.parse(periodStart(period, now));
  const selectTab = (next: RecordTab) =>
    setParams(next === 'overview' ? {} : { onglet: TAB_PARAM[next] }, { replace: true });
  const withPeriod = tab === 'glucose' || TIMELINE_TABS.includes(tab);
  const withUnit = tab === 'overview' || tab === 'glucose' || tab === 'timeline';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {summary.isPending ? <Loading /> : null}
      {summary.isError && !summary.data ? (
        <Problem error={summary.error} onRetry={() => void summary.refetch()} />
      ) : null}

      {summary.data ? (
        <>
          <RecordHeader summary={summary.data} now={now} />
          <RecordTabs tabs={tabs} current={tab} onSelect={selectTab} />
          {withPeriod || withUnit ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {withPeriod ? (
                <Segmented
                  label={fr.record.period}
                  value={period}
                  onChange={setPeriod}
                  options={PERIODS.map((days) => ({
                    value: days,
                    label: fill(fr.record.periodDays, { days }),
                    a11y: fill(fr.record.periodA11y, { days }),
                  }))}
                />
              ) : null}
              {withUnit ? (
                <Segmented
                  label={fr.record.unit}
                  value={unit}
                  onChange={setUnitChoice}
                  options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
                />
              ) : null}
            </div>
          ) : null}

          <TabPanel tab={tab}>
            {tab === 'overview' ? <OverviewTab summary={summary.data} unit={unit} /> : null}

            {tab === 'glucose' ? (
              measurements.data ? (
                <GlucoseTab
                  summary={summary.data}
                  measurements={measurements.data.items}
                  truncated={measurements.data.truncated}
                  unit={unit}
                  from={from}
                  to={to}
                />
              ) : measurements.isError ? (
                <Problem error={measurements.error} onRetry={() => void measurements.refetch()} />
              ) : (
                <Loading />
              )
            ) : null}

            {TIMELINE_TABS.includes(tab) ? (
              timeline.data ? (
                <TimelineTab
                  items={timeline.data.items}
                  truncated={timeline.data.truncated}
                  unit={unit}
                  kind={tab in TAB_KIND ? TAB_KIND[tab as keyof typeof TAB_KIND] : undefined}
                  now={now}
                />
              ) : timeline.isError ? (
                <Problem error={timeline.error} onRetry={() => void timeline.refetch()} />
              ) : (
                <Loading />
              )
            ) : null}

            {tab === 'summary' ? <SummaryTab insights={summary.data.insights ?? []} /> : null}
          </TabPanel>
        </>
      ) : null}
    </div>
  );
}
