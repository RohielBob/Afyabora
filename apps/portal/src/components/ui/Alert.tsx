// Bandeau de message dans la page (erreur, information, succès, attention) : icône + titre + texte.
// Annoncé aux lecteurs d'écran (role « alert » pour une erreur, « status » sinon). Apparaît en fondu.
import type { ReactNode } from 'react';

export type AlertTone = 'danger' | 'info' | 'success' | 'warning';

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  danger: { box: 'border-danger/25 bg-danger-soft', icon: 'text-danger' },
  info: {
    box: 'border-[color-mix(in_srgb,var(--afy-info)_25%,transparent)] bg-[color-mix(in_srgb,var(--afy-info)_8%,transparent)]',
    icon: 'text-info',
  },
  success: {
    box: 'border-[color-mix(in_srgb,var(--afy-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--afy-success)_8%,transparent)]',
    icon: 'text-success',
  },
  warning: {
    box: 'border-[color-mix(in_srgb,var(--afy-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--afy-warning)_9%,transparent)]',
    icon: 'text-warning',
  },
};

function Icon({ tone }: { tone: AlertTone }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      {tone === 'success' ? (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M8 12.5l2.7 2.7L16 9.5" {...common} />
        </>
      ) : tone === 'warning' ? (
        <>
          <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" {...common} />
          <path d="M12 10v4M12 17h.01" {...common} />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d={tone === 'info' ? 'M12 11v5M12 8h.01' : 'M12 7.5v5M12 16h.01'} {...common} />
        </>
      )}
    </svg>
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
}) {
  const style = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`animate-enter flex gap-3 rounded-xl border px-4 py-3 ${style.box}`}
    >
      <span className={`mt-px ${style.icon}`}>
        <Icon tone={tone} />
      </span>
      <div className="flex flex-col gap-0.5 text-[14px] leading-[1.45]">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}
