// Règle du mot de passe affichée en direct sous le champ : le rond se remplit (coche) quand elle est
// respectée. Même règle que le serveur (PASSWORD_MIN_LENGTH de @glyka/shared).
import { PASSWORD_MIN_LENGTH } from '@glyka/shared';
import { fr } from '@/i18n/fr';

export function PasswordRule({ password }: { password: string }) {
  const ok = password.length >= PASSWORD_MIN_LENGTH;
  return (
    <p
      className={`transition-afy flex items-center gap-2 text-[13px] ${ok ? 'text-success' : 'text-muted'}`}
    >
      <span
        aria-hidden="true"
        className={`transition-afy flex size-4 items-center justify-center rounded-full border-[1.5px] ${ok ? 'border-success bg-success text-on-primary' : 'border-line-strong'}`}
      >
        {ok ? (
          <svg viewBox="0 0 12 12" className="size-2.5">
            <path
              d="M2.5 6.2l2.2 2.2L9.5 3.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span>
        {fr.password.rule}
        <span className="sr-only">{ok ? ' : respecté' : ' : pas encore respecté'}</span>
      </span>
    </p>
  );
}
