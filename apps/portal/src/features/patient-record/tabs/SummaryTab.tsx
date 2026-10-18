// « Résumé des analyses » (L5-12, visible seulement si le patient l'a partagé) : les observations du moteur
// d'analyse (@glyka/analytics) sur 30 jours, avec leur phrase (gabarit, ou reformulation relue par les
// garde-fous, L3-05) et le nombre de mesures qui les justifient. Jamais un diagnostic ni un conseil.
import type { InsightDto, InsightSeverity } from '@glyka/shared';
import { Alert } from '@/components/ui';
import { fr } from '@/i18n/fr';
import { insightView } from '../view';

const t = fr.record.summary;

/** Gravité : icône + mot (jamais la couleur seule), sans rouge (le rouge est la marque). */
const SEVERITY_TONE: Record<InsightSeverity, string> = {
  INFO: 'bg-surface-muted text-info',
  ATTENTION: 'bg-surface-muted text-warning',
  ALERT: 'bg-state-very-high-bg text-state-very-high-fg',
};

function SeverityIcon({ severity }: { severity: InsightSeverity }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5">
      {severity === 'INFO' ? (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M12 11v5M12 8h.01" {...common} />
        </>
      ) : severity === 'ATTENTION' ? (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M12 7.5v5.5M12 16.5h.01" {...common} />
        </>
      ) : (
        <path d="M12 3.5 2.8 19.5h18.4L12 3.5ZM12 10v4M12 17h.01" {...common} />
      )}
    </svg>
  );
}

export function SummaryTab({ insights }: { insights: InsightDto[] }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold text-ink">{t.title}</h2>
        <p className="text-[13px] text-muted">{t.hint}</p>
      </div>
      {insights.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-[14px] text-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {insights.map((insight, index) => {
            const view = insightView(insight);
            return (
              <li
                key={`${insight.type}-${index}`}
                className="animate-enter flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${SEVERITY_TONE[insight.severity]}`}
                  >
                    <SeverityIcon severity={insight.severity} />
                    {view.severity}
                  </span>
                  <h3 className="text-[15px] font-bold text-ink">{view.type}</h3>
                </div>
                <p className="text-[14px] leading-relaxed text-ink">{insight.text}</p>
                {view.evidence ? <p className="text-[12px] text-muted">{view.evidence}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Alert tone="info">{t.disclaimer}</Alert>
    </>
  );
}
