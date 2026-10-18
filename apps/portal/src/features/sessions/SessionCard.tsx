// Une ligne de « Mes patients partagés » (L5-11) : prénom et type de diabète, état de l'accès (icône + texte),
// heure de fin, ce que le patient a partagé, dernière mesure, qualité des données, « Ouvrir le dossier ».
// Un accès terminé reste visible (historique) mais grisé et sans bouton : son dossier ne s'ouvre plus.
import type { DoctorSessionDto, QualityLevel } from '@glyka/shared';
import { ButtonLink } from '@/components/ui';
import { fr } from '@/i18n/fr';
import { lastMeasurementText, orderedCategories, qualityView, statusView } from './view';

/** Couleur du niveau de qualité (toujours avec l'icône et le texte). Aussi utilisée par le dossier (L5-12). */
export const QUALITY_TONE = {
  GOOD: 'text-success',
  PARTIAL: 'text-warning',
  INSUFFICIENT: 'text-muted',
} as const;

function StatusIcon({ active }: { active: boolean }) {
  return active ? (
    // Œil ouvert : accès en cours.
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
  ) : (
    // Cadenas : accès terminé.
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
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Trois barres dont le nombre de pleines dit le niveau. Aussi utilisée par le dossier (L5-12). */
export function QualityIcon({ level }: { level: QualityLevel }) {
  // Trois barres : 3 pleines (bonne), 2 (partielle), 1 (insuffisante) : la forme dit le niveau.
  const filled = level === 'GOOD' ? 3 : level === 'PARTIAL' ? 2 : 1;
  return (
    <svg aria-hidden="true" viewBox="0 0 18 14" className="size-4">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={i * 6}
          y={10 - i * 4}
          width="4"
          height={4 + i * 4}
          rx="1"
          fill="currentColor"
          opacity={i < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

export function SessionCard({
  session,
  now,
  index,
}: {
  session: DoctorSessionDto;
  now: Date;
  index: number;
}) {
  const status = statusView(session, now);
  const active = status.tone === 'active';
  const last = lastMeasurementText(session, now);
  const quality = session.quality
    ? qualityView(session.quality.level, session.quality.score)
    : null;

  return (
    <li
      className={`animate-enter flex flex-col gap-4 rounded-2xl border bg-surface p-5 sm:flex-row sm:items-center sm:gap-6 ${active ? 'border-line' : 'border-line opacity-75'}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-[18px] font-bold text-ink">{session.patient.firstName}</h2>
          <span className="text-[14px] text-muted">
            {fr.patients.diabetes[session.patient.diabetesType]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${active ? 'bg-primary-soft text-primary-text' : 'bg-surface-muted text-muted'}`}
          >
            <StatusIcon active={active} />
            {status.label}
          </span>
          {status.when ? <span className="text-muted">{status.when}</span> : null}
        </div>
        <p className="text-[13px] text-muted">
          <span className="font-semibold text-ink">{fr.patients.shared}</span>{' '}
          {orderedCategories(session.categories)
            .map((c) => fr.patients.categories[c])
            .join(' · ')}
        </p>
        {last || quality ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
            {last ? <span>{last}</span> : null}
            {quality && session.quality ? (
              <span
                role="img"
                aria-label={quality.a11y}
                className={`inline-flex items-center gap-1.5 font-semibold ${QUALITY_TONE[session.quality.level]}`}
              >
                <QualityIcon level={session.quality.level} />
                {quality.label}
                <span className="font-normal text-muted">({session.quality.score}/100)</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {active ? (
        <ButtonLink to={`/patients/${session.sessionId}`} className="sm:w-auto sm:min-w-[200px]">
          {fr.patients.open}
        </ButtonLink>
      ) : null}
    </li>
  );
}
