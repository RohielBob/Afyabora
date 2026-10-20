// Connexion médecin (L1-11). Messages selon la réponse du serveur (identifiants incorrects, email non
// vérifié, compte bloqué + durée). Un compte patient ou admin est refusé ici (pas de session gardée).
// Après connexion : la page demandée avant (si elle existait), sinon « Mes patients » ou « en attente ».
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert, Button, TextField, TextLink } from '@/components/ui';
import {
  IDLE_LIMIT_MS,
  PATHS,
  authErrorMessage,
  signIn,
  useSession,
  validateSignIn,
} from '@/features/auth';
import { fill, texts } from '@/i18n';

export default function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const passwordRef = useRef<HTMLInputElement>(null);
  const from = (location.state as { from?: string } | null)?.from;
  const presetEmail = new URLSearchParams(location.search).get('email') ?? '';

  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldErrors = submitted ? validateSignIn({ email, password }) : {};

  // Pourquoi on arrive ici (session expirée, inactivité) : expliqué une fois, en haut du formulaire.
  const reason = session.status === 'signedOut' ? session.reason : 'none';
  const notice =
    reason === 'expired'
      ? texts.errors.sessionExpired
      : reason === 'idle'
        ? fill(texts.errors.idle, { minutes: IDLE_LIMIT_MS / 60_000 })
        : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (Object.keys(validateSignIn({ email, password })).length) return;
    setLoading(true);
    try {
      const destination = await signIn(email, password);
      if (destination === 'notDoctor') {
        setError(texts.errors.notDoctor);
        setSubmitted(false);
        setPassword('');
        return;
      }
      // Retour à la page demandée seulement si le compte y a accès (approuvé) ; sinon page d'accueil.
      const target =
        destination === 'patients' && from && from !== PATHS.pending ? from : PATHS[destination];
      navigate(target, { replace: true });
    } catch (e) {
      setError(authErrorMessage(e, 'login'));
      // Mot de passe effacé, sans afficher « saisissez votre mot de passe » en plus du message.
      setSubmitted(false);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      overline={texts.login.overline}
      title={texts.login.title}
      subtitle={texts.login.subtitle}
    >
      {notice && !error ? <Alert tone="info">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <TextField
          label={texts.fields.email}
          placeholder={texts.fields.emailPlaceholder}
          type="email"
          autoComplete="username"
          autoFocus={!presetEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={loading}
        />
        <div className="flex flex-col gap-2">
          <TextField
            ref={passwordRef}
            label={texts.fields.password}
            secret
            autoComplete="current-password"
            autoFocus={!!presetEmail}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            disabled={loading}
          />
          <TextLink to="/forgot-password" state={{ email }} className="self-end text-[14px]">
            {texts.login.forgot}
          </TextLink>
        </div>
        <Button type="submit" size="lg" loading={loading}>
          {texts.login.submit}
        </Button>
      </form>

      <p className="text-center text-[14px] text-muted">
        {texts.login.noAccount} <TextLink to="/register">{texts.login.register}</TextLink>
      </p>

      <p className="rounded-xl bg-surface-muted px-4 py-3 text-[13px] leading-[1.5] text-muted">
        {fill(texts.login.sharedComputer, { minutes: IDLE_LIMIT_MS / 60_000 })}
      </p>
    </AuthLayout>
  );
}
