// Panneau de résultat (adresse vérifiée, email envoyé, lien non valable…) : grande icône dans un cercle
// qui apparaît avec un léger zoom, titre, texte, puis les actions.
import type { ReactNode } from 'react';

type Tone = 'success' | 'info' | 'danger' | 'pending';

const RING: Record<Tone, string> = {
  success: 'bg-[color-mix(in_srgb,var(--afy-success)_12%,transparent)] text-success',
  info: 'bg-primary-soft text-primary-text',
  danger: 'bg-danger-soft text-danger',
  pending: 'bg-[color-mix(in_srgb,var(--afy-warning)_14%,transparent)] text-warning',
};

const PATHS: Record<Tone, ReactNode> = {
  success: <path d="M7 12.5l3.2 3.2L17 9" />,
  info: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  danger: <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />,
  pending: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
};

export function ResultPanel({
  tone,
  title,
  children,
  actions,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div
        className={`flex size-16 items-center justify-center rounded-2xl ${RING[tone]} animate-enter`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {PATHS[tone]}
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.5px] text-ink">{title}</h1>
        {children ? (
          <div className="flex flex-col gap-3 text-[15px] text-muted">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-col gap-3">{actions}</div> : null}
    </section>
  );
}
