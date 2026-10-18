// Choix exclusif court (période, unité) : boutons collés, l'option choisie est surlignée ET annoncée
// (aria-pressed). Navigation au clavier : Tab puis Entrée/Espace, comme des boutons ordinaires.
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  /** Nom du groupe (« Période », « Unité »), visible et lu par les lecteurs d'écran. */
  label: string;
  options: readonly { value: T; label: string; a11y?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex rounded-xl border border-line bg-surface-muted p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              aria-label={option.a11y}
              onClick={() => onChange(option.value)}
              className={[
                'transition-afy rounded-[10px] px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap',
                selected
                  ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_19_24/0.12)]'
                  : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
