// Bandeau permanent du dossier (L5-13, CDC F8) : « Accès valable : 04:37 », puis « Accès expiré ».
//  - Toujours visible en haut de la page (collé sous l'en-tête du portail quand on fait défiler).
//  - Heure de fin du SERVEUR et heure du SERVEUR (useCountdown) ; indicatif : le serveur refuse toute
//    lecture après la fin, quoi qu'affiche ce bandeau.
//  - Les 2 dernières minutes : ton « attention » (couleur + icône + mot « bientôt »), jamais rouge.
//  - Lecteurs d'écran : le minuteur n'est pas lu à chaque seconde (bruit) ; une annonce polie à 5 minutes
//    puis à 1 minute.
//  - À zéro : `onEnd()` une seule fois ; la page efface le dossier et affiche « Accès expiré ».
import { useEffect, useRef, useState } from 'react';
import { when } from '@/features/sessions/view';
import { fill, texts } from '@/i18n';
import { announcement, countdownView } from './countdown';
import { useCountdown } from './useCountdown';

const TONE = {
  normal: 'border-line bg-surface text-ink',
  soon: 'border-[color-mix(in_srgb,var(--afy-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--afy-warning)_10%,var(--afy-surface))] text-ink',
  ended: 'border-line bg-surface-muted text-muted',
} as const;

function ClockIcon({ soon }: { soon: boolean }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-5 shrink-0 ${soon ? 'text-warning' : 'text-muted'}`}
    >
      {soon ? (
        // Sablier : il reste peu de temps.
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9" {...common} />
      ) : (
        <>
          <circle cx="12" cy="13" r="8" {...common} />
          <path d="M12 9v4l2.5 2.5M9.5 2.5h5" {...common} />
        </>
      )}
    </svg>
  );
}

export function AccessBanner({ expiresAt, onEnd }: { expiresAt: string; onEnd: () => void }) {
  const seconds = useCountdown(expiresAt) ?? 0;
  const view = countdownView(seconds);
  const previous = useRef<number | null>(null);
  const [spoken, setSpoken] = useState('');
  const ended = useRef(false);

  useEffect(() => {
    const message = announcement(previous.current, seconds);
    if (message) setSpoken(message);
    previous.current = seconds;
    if (seconds <= 0 && !ended.current) {
      ended.current = true;
      onEnd();
    }
  }, [seconds, onEnd]);

  return (
    <div
      className={`transition-afy sticky top-16 z-[5] flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 shadow-[0_6px_20px_-14px_rgb(16_19_24/0.45)] backdrop-blur ${TONE[view.tone]}`}
    >
      <ClockIcon soon={view.tone === 'soon'} />
      <span
        role="timer"
        aria-live="off"
        aria-label={view.a11y}
        className="text-[15px] font-bold tabular-nums"
      >
        {view.text}
      </span>
      {view.tone === 'soon' ? (
        <span className="text-[13px] font-semibold text-warning">{texts.access.soon}</span>
      ) : null}
      <span className="ml-auto text-[13px] text-muted">
        {fill(texts.access.until, { when: when(expiresAt, new Date()) })}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </div>
  );
}
