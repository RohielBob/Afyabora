// Adresse inconnue : message simple et retour à l'accueil (qui choisit la bonne page selon la session).
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { ButtonLink } from '@/components/ui';
import { texts } from '@/i18n';

export default function NotFoundRoute() {
  return (
    <AuthLayout>
      <ResultPanel
        tone="info"
        title={texts.notFound.title}
        actions={
          <ButtonLink to="/" variant="outline">
            {texts.notFound.home}
          </ButtonLink>
        }
      >
        <p>{texts.notFound.text}</p>
      </ResultPanel>
    </AuthLayout>
  );
}
