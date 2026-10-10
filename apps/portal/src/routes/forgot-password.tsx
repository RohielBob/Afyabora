// Mot de passe oublié (API L1-03 : POST /auth/forgot-password). Le serveur répond toujours de la même
// façon, que le compte existe ou non : l'écran de confirmation dit « si un compte existe… ».
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { Alert, Button, ButtonLink, TextField, TextLink } from '@/components/ui';
import { authApi, authErrorMessage, validateEmail } from '@/features/auth';
import { fill, fr } from '@/i18n/fr';

export default function ForgotPasswordRoute() {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const fieldError = submitted ? validateEmail(email) : undefined;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (validateEmail(email)) return;
    setLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      await authApi.forgotPassword(normalized);
      setSentTo(normalized);
    } catch (e) {
      setError(authErrorMessage(e, 'forgot'));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <ResultPanel
          tone="info"
          title={fr.forgot.sentTitle}
          actions={
            <ButtonLink to="/login" variant="outline">
              {fr.forgot.backToLogin}
            </ButtonLink>
          }
        >
          <p>{fill(fr.forgot.sentText, { email: sentTo })}</p>
          <p className="text-[13px] text-subtle">{fr.register.sentSpam}</p>
        </ResultPanel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout overline={fr.forgot.overline} title={fr.forgot.title} subtitle={fr.forgot.subtitle}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <TextField
          label={fr.fields.email}
          placeholder={fr.fields.emailPlaceholder}
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
          disabled={loading}
        />
        <Button type="submit" size="lg" loading={loading}>
          {fr.forgot.submit}
        </Button>
      </form>
      <p className="text-center text-[14px]">
        <TextLink to="/login">{fr.forgot.backToLogin}</TextLink>
      </p>
    </AuthLayout>
  );
}
