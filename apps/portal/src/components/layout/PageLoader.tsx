// Écran de chargement (reprise de la session au démarrage) : le logo, entouré d'une onde qui s'élargit
// doucement. Pas de texte qui clignote ; annoncé aux lecteurs d'écran.
import { LogoMark } from '@/components/brand/Logo';
import { texts } from '@/i18n';

export function PageLoader() {
  return (
    <div
      role="status"
      aria-label={texts.common.loading}
      className="flex min-h-dvh items-center justify-center bg-page"
    >
      <div className="animate-fade relative flex size-24 items-center justify-center">
        <span
          aria-hidden="true"
          className="animate-pulse-ring absolute inset-0 rounded-full bg-primary-soft"
        />
        <LogoMark size={52} className="relative" />
      </div>
    </div>
  );
}
