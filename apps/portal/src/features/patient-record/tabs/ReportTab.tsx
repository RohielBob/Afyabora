// « Rapport PDF » (L6-04, CDC F9) : visible SEULEMENT si le patient a coché « Rapport PDF » en partageant
// (tabsFor). Le médecin choisit la période (14 / 30 / 90 jours) et télécharge le rapport « Préparer ma
// consultation » du patient. Le serveur revérifie l'accès à chaque téléchargement et l'inscrit dans le
// journal du patient : c'est dit ici, avant le clic. Fin d'accès pendant le téléchargement ⇒ le dossier
// entier est effacé, comme pour les autres onglets (onEnded).
import { useState } from 'react';
import { Alert, Button, Segmented } from '@/components/ui';
import { fill, texts } from '@/i18n';
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  browserDeps,
  downloadReport,
  type ReportDeps,
  type ReportPeriod,
  type ReportProblem,
} from '../report';
import { timeText, type EndReason } from '../view';

const t = texts.record.report;

type State =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done'; filename: string; at: Date }
  | { status: 'failed'; problem: Exclude<ReportProblem, { kind: 'ended' }> };

function DocumentIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function Note({ children, icon }: { children: string; icon: 'log' | 'lock' | 'sign' }) {
  return (
    <li className="flex items-start gap-2 text-[13px] text-muted">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 size-4 shrink-0 text-primary-text"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === 'log' ? (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : icon === 'lock' ? (
          <>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </>
        ) : (
          <path d="M20 6 9 17l-5-5" />
        )}
      </svg>
      <span>{children}</span>
    </li>
  );
}

export function ReportTab({
  sessionId,
  onEnded,
  deps = browserDeps,
}: {
  sessionId: string;
  onEnded: (reason: EndReason) => void;
  deps?: ReportDeps;
}) {
  const [period, setPeriod] = useState<ReportPeriod>(DEFAULT_REPORT_PERIOD);
  const [state, setState] = useState<State>({ status: 'idle' });

  const download = async () => {
    setState({ status: 'working' });
    const outcome = await downloadReport(sessionId, period, deps);
    if (outcome.ok) {
      setState({ status: 'done', filename: outcome.filename, at: outcome.at });
    } else if (outcome.problem.kind === 'ended') {
      onEnded(outcome.problem.reason); // accès terminé : tout le dossier disparaît
    } else {
      setState({ status: 'failed', problem: outcome.problem });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="animate-enter flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
            <DocumentIcon className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-bold text-ink">{t.title}</h2>
            <p className="text-[14px] text-muted">{t.intro}</p>
          </div>
        </div>

        <Segmented
          label={t.period}
          value={period}
          onChange={(days) => {
            setPeriod(days);
            if (state.status !== 'working') setState({ status: 'idle' });
          }}
          options={REPORT_PERIODS.map((days) => ({
            value: days,
            label: fill(texts.record.periodDays, { days }),
            a11y: fill(texts.record.periodA11y, { days }),
          }))}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            size="lg"
            fullWidth={false}
            loading={state.status === 'working'}
            icon={<DocumentIcon />}
            onClick={() => void download()}
          >
            {t.download}
          </Button>
          <p role="status" className="text-[13px] text-muted">
            {state.status === 'working' ? t.downloading : ''}
          </p>
        </div>

        {state.status === 'done' ? (
          <Alert tone="success" title={t.done}>
            {fill(t.doneText, {
              filename: state.filename,
              time: timeText(state.at.toISOString()),
            })}
          </Alert>
        ) : null}
        {state.status === 'failed' ? (
          <Alert
            tone={state.problem.kind === 'server' ? 'danger' : 'warning'}
            title={t.problem[state.problem.kind].title}
          >
            {t.problem[state.problem.kind].text}
          </Alert>
        ) : null}

        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          <Note icon="log">{t.logged}</Note>
          <Note icon="sign">{t.signed}</Note>
          <Note icon="lock">{t.private}</Note>
        </ul>
      </section>

      <section
        className="animate-enter flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted p-6"
        style={{ animationDelay: '60ms' }}
      >
        <h3 className="text-[14px] font-bold text-ink">{t.contentsTitle}</h3>
        <ul className="flex flex-col gap-2.5">
          {t.contents.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[14px] text-ink">
              <span
                aria-hidden="true"
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary-text"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
