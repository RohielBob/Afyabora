// Adresse inconnue : message simple et retour à l'accueil (qui choisit la bonne page selon la session).
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { ButtonLink } from '@/components/ui';
import { fr } from '@/i18n/fr';

export default function NotFoundRoute() {
  return (
    <AuthLayout>
      <ResultPanel
        tone="info"
        title={fr.notFound.title}
        actions={
          <ButtonLink to="/" variant="outline">
            {fr.notFound.home}
          </ButtonLink>
        }
      >
        <p>{fr.notFound.text}</p>
      </ResultPanel>
    </AuthLayout>
  );
}
