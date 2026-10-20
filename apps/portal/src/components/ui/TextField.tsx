// Champ de saisie : libellé au-dessus, aide ou erreur en dessous (texte + symbole, jamais la couleur
// seule), bouton « Afficher / Masquer » pour les mots de passe. L'erreur est reliée au champ
// (aria-describedby) pour les lecteurs d'écran.
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { texts } from '@/i18n';

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
    error?: string;
    /** Mot de passe : texte masqué + bouton « Afficher ». */
    secret?: boolean;
  }
>(function TextField(
  { label, hint, error, secret, className = '', id, type = 'text', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  const [visible, setVisible] = useState(false);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={secret ? (visible ? 'text' : 'password') : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? helpId : undefined}
          className={[
            'transition-afy h-12 w-full rounded-xl border bg-surface px-4 text-[16px] text-ink',
            'placeholder:text-subtle focus:outline-none focus-visible:outline-none',
            'focus:border-focus focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--afy-focus)_14%,transparent)]',
            error ? 'border-danger' : 'border-line-strong hover:border-subtle',
            secret ? 'pr-24' : '',
          ].join(' ')}
          {...rest}
        />
        {secret ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-controls={inputId}
            className="transition-afy absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-[14px] font-semibold text-primary-text hover:bg-primary-soft"
          >
            {visible ? texts.common.hide : texts.common.show}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={helpId} className="animate-fade text-[13px] font-medium text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : hint ? (
        <p id={helpId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
