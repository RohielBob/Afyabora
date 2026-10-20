// Page du lien « confirmez votre adresse » envoyé par l'API (PORTAL_URL/verify-email?token=…).
// Elle sert aux médecins ET aux patients (qui ouvrent souvent l'email sur leur ordinateur) : la
// vérification se fait toute seule à l'ouverture, puis on dit à chacun quoi faire.
// Sécurité : le jeton est retiré de la barre d'adresse dès sa lecture (il ne reste pas dans l'historique),
// et la requête n'est envoyée qu'une fois (React rejoue les effets en développement).
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { ButtonLink, Spinner } from '@/components/ui';
import { authApi, authErrorMessage, tokenFromSearch } from '@/features/auth';
import { texts } from '@/i18n';

type State = { kind: 'working' } | { kind: 'ok' } | { kind: 'error'; message: string };

export default function VerifyEmailRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = tokenFromSearch(location.search);
    navigate(location.pathname, { replace: true }); // le jeton quitte l'adresse affichée
    if (!token) {
      setState({ kind: 'error', message: texts.verify.missing });
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setState({ kind: 'ok' }))
      .catch((e: unknown) => setState({ kind: 'error', message: authErrorMessage(e, 'verify') }));
  }, [location.pathname, location.search, navigate]);

  return (
    <AuthLayout>
      {state.kind === 'working' ? (
        <div className="flex items-center gap-3 text-[15px] text-muted" aria-live="polite">
          <span className="text-primary-text">
            <Spinner size={22} />
          </span>
          {texts.verify.working}
        </div>
      ) : state.kind === 'ok' ? (
        <ResultPanel
          tone="success"
          title={texts.verify.okTitle}
          actions={<ButtonLink to="/login">{texts.verify.signIn}</ButtonLink>}
        >
          <p>{texts.verify.okText}</p>
          <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 text-[14px] text-ink">
            <li>{texts.verify.okDoctor}</li>
            <li>{texts.verify.okPatient}</li>
          </ul>
        </ResultPanel>
      ) : (
        <ResultPanel
          tone="danger"
          title={texts.verify.failTitle}
          actions={
            <ButtonLink to="/register" variant="outline">
              {texts.verify.register}
            </ButtonLink>
          }
        >
          <p>{state.message}</p>
        </ResultPanel>
      )}
    </AuthLayout>
  );
}
