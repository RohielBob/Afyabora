// Case à cocher : jamais pré-cochée par les pages. Toute la ligne (case + texte) est cliquable ; une vraie
// <input type="checkbox"> (clavier, lecteurs d'écran) habillée aux couleurs du thème. Erreur sous le texte.
import { useId, type ReactNode } from 'react';

export function Checkbox({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="group flex cursor-pointer items-start gap-3">
        <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={[
              'transition-afy peer size-5 cursor-pointer appearance-none rounded-md border-2 bg-surface',
              'checked:border-primary checked:bg-primary',
              error ? 'border-danger' : 'border-line-strong group-hover:border-subtle',
            ].join(' ')}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute size-3.5 scale-50 text-on-primary opacity-0 transition-all duration-150 peer-checked:scale-100 peer-checked:opacity-100"
          >
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-[14px] leading-[1.45] text-ink">{children}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="animate-fade ml-8 text-[13px] font-medium text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
