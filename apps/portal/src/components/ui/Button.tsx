// Bouton du portail : principal (rouge Afyabora), contour, discret ou danger. Léger enfoncement au clic,
// indicateur de chargement qui remplace le texte sans changer la taille du bouton.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary shadow-[0_1px_2px_rgb(16_19_24/0.08),0_4px_14px_-6px_var(--afy-primary)] hover:bg-primary-pressed',
  outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-primary-text hover:bg-primary-soft',
  danger: 'border border-danger/40 bg-surface text-danger hover:bg-danger-soft',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  icon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'transition-afy relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
        size === 'lg' ? 'h-13 px-6 text-[16px]' : 'h-11 px-5 text-[15px]',
        fullWidth ? 'w-full' : '',
        VARIANTS[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2 ${loading ? 'invisible' : ''}`}>
        {icon}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={20} />
        </span>
      ) : null}
    </button>
  );
}
