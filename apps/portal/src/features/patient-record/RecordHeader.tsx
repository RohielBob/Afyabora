// En-tête du dossier (L5-12) : prénom, type de diabète et année du diagnostic (rien de plus sur l'identité),
// état de l'accès avec l'heure de fin donnée par le SERVEUR, ce que le patient a partagé, avertissement
// « outil d'aide ». Le compte à rebours et l'écran « Accès expiré » arrivent avec L5-13.
import type { DoctorSummary } from '@glyka/shared';
import { TextLink } from '@/components/ui';
import { statusView } from '@/features/sessions/view';
import { fill, fr } from '@/i18n/fr';
import { orderedCategories } from './view';

export function RecordHeader({ summary, now }: { summary: DoctorSummary; now: Date }) {
  const { patient, session } = summary;
  const status = statusView(session, now);
  return (
    <header className="animate-enter flex flex-col gap-4">
      <TextLink to="/patients" className="inline-flex w-fit items-center gap-1 text-[14px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {fr.record.back}
      </TextLink>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
            {fr.record.overline}
          </p>
          <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.6px] text-ink">
            {patient.firstName}
          </h1>
          <p className="text-[15px] text-muted">
            {fr.patients.diabetes[patient.diabetesType]}
            {patient.diagnosisYear
              ? ` · ${fill(fr.record.diagnosed, { year: patient.diagnosisYear })}`
              : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary-text">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {status.label}
            {status.when ? <span className="font-normal">· {status.when}</span> : null}
          </span>
          <p className="text-[13px] text-muted lg:text-right">
            <span className="font-semibold text-ink">{fr.patients.shared}</span>{' '}
            {orderedCategories(session.categories)
              .map((c) => fr.patients.categories[c])
              .join(' · ')}
          </p>
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 size-4 shrink-0 text-info"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <span>
          {fr.record.disclaimer} {fr.record.readOnly}
        </span>
      </p>
    </header>
  );
}
