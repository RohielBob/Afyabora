// Lien qui a l'apparence d'un bouton (action principale d'un écran de résultat, ex. « Se connecter »
// après la vérification de l'adresse). Mêmes styles que <Button>.
import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

const VARIANTS = {
  primary:
    'bg-primary text-on-primary shadow-[0_1px_2px_rgb(16_19_24/0.08),0_4px_14px_-6px_var(--afy-primary)] hover:bg-primary-pressed',
  outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted',
} as const;

export function ButtonLink({
  variant = 'primary',
  children,
  className = '',
  ...rest
}: LinkProps & { variant?: keyof typeof VARIANTS; children: ReactNode }) {
  return (
    <Link
      className={[
        'transition-afy inline-flex h-13 w-full items-center justify-center rounded-xl px-6 text-[16px] font-semibold active:scale-[0.98]',
        VARIANTS[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Link>
  );
}
