// Page du lien « réinitialiser le mot de passe » (PORTAL_URL/reset-password?token=…, API L1-03).
// Sert aux médecins ET aux patients. Le jeton est retiré de la barre d'adresse dès la lecture et gardé
// en mémoire le temps de choisir le mot de passe. Un mot de passe refusé ne consomme pas le lien.
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { Alert, Button, ButtonLink, TextField } from '@/components/ui';
import { authApi, authErrorMessage, tokenFromSearch, validateNewPassword } from '@/features/auth';
import { ApiError } from '@/lib/api-client';
import { PasswordRule } from '@/features/auth/components/PasswordRule';
import { fr } from '@/i18n/fr';

export default function ResetPasswordRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  // Lu une seule fois au premier affichage (gardé en mémoire), puis effacé de l'adresse.
  const [token] = useState(() => tokenFromSearch(location.search));
  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const [done, setDone] = useState(false);
  const fieldError = submitted ? validateNewPassword(password) : undefined;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!token || validateNewPassword(password)) return;
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setPassword('');
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e, 'reset'));
      // Lien mort : inutile de laisser le formulaire, on propose d'en demander un autre.
      if (e instanceof ApiError && e.code === 'TOKEN_INVALID') setLinkDead(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <ResultPanel
          tone="success"
          title={fr.reset.okTitle}
          actions={<ButtonLink to="/login">{fr.verify.signIn}</ButtonLink>}
        >
          <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 text-[14px] text-ink">
            <li>{fr.reset.okDoctor}</li>
            <li>{fr.reset.okPatient}</li>
          </ul>
        </ResultPanel>
      </AuthLayout>
    );
  }

  if (!token || linkDead) {
    return (
      <AuthLayout>
        <ResultPanel
          tone="danger"
          title={fr.verify.failTitle}
          actions={<ButtonLink to="/forgot-password">{fr.reset.newLink}</ButtonLink>}
        >
          <p>{error ?? fr.reset.missing}</p>
        </ResultPanel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout overline={fr.reset.overline} title={fr.reset.title} subtitle={fr.reset.subtitle}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Champ caché : aide les gestionnaires de mots de passe à associer le nouveau mot de passe. */}
        <input type="text" autoComplete="username" hidden readOnly />
        <div className="flex flex-col gap-2">
          <TextField
            label={fr.fields.newPassword}
            hint={fr.fields.passwordHint}
            secret
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError}
            disabled={loading}
            maxLength={128}
          />
          <PasswordRule password={password} />
        </div>
        <Button type="submit" size="lg" loading={loading}>
          {fr.reset.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
