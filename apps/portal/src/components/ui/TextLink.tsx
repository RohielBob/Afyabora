// Lien de texte (navigation interne) aux couleurs d'accent, souligné au survol.
import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export function TextLink({
  children,
  className = '',
  ...rest
}: LinkProps & { children: ReactNode }) {
  return (
    <Link
      className={`transition-afy rounded-sm font-semibold text-primary-text underline-offset-4 hover:underline ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
