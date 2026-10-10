// Indicateur de chargement : un arc qui tourne (couleur du texte autour). Annoncé aux lecteurs d'écran.
import { fr } from '@/i18n/fr';

export function Spinner({
  size = 20,
  label = fr.common.loading,
}: {
  size?: number;
  label?: string;
}) {
  return (
    <svg
      role="status"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin-smooth"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
