// État d'une glycémie (dossier patient, L5-12) : symbole + libellé + couleur de la palette des états
// (@glyka/ui-tokens, SANS rouge, ADR-0008). L'état n'est jamais dit par la couleur seule : « ▲ Au-dessus ».
// Mêmes symboles et mêmes mots que l'application du patient (STATE_SYMBOLS de @glyka/shared).
import { STATE_SYMBOLS, type GlucoseState } from '@glyka/shared';
import { texts } from '@/i18n';

/** Classes de chaque état, écrites en entier pour que Tailwind les génère. */
export const STATE_CLASSES: Record<GlucoseState, string> = {
  VERY_LOW: 'border-state-very-low-border bg-state-very-low-bg text-state-very-low-fg',
  LOW: 'border-state-low-border bg-state-low-bg text-state-low-fg',
  IN_RANGE: 'border-state-in-range-border bg-state-in-range-bg text-state-in-range-fg',
  HIGH: 'border-state-high-border bg-state-high-bg text-state-high-fg',
  VERY_HIGH: 'border-state-very-high-border bg-state-very-high-bg text-state-very-high-fg',
};

export function GlucoseStateBadge({
  state,
  compact = false,
}: {
  state: GlucoseState;
  /** Symbole seul (le libellé reste lu par les lecteurs d'écran et affiché au survol). */
  compact?: boolean;
}) {
  const label = texts.record.states[state];
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATE_CLASSES[state]}`}
    >
      <span aria-hidden="true" className="text-[10px] tracking-[-1px]">
        {STATE_SYMBOLS[state].symbol}
      </span>
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
