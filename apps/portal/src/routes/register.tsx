// Inscription médecin (L1-11, API L1-01 : POST /auth/register-doctor).
// Trois blocs : identité, exercice (numéro d'ordre, établissement), accès (email, mot de passe), puis
// deux cases jamais pré-cochées : « je certifie être professionnel de santé » et « je respecte le secret
// médical, mes accès sont journalisés ». Le serveur reçoit `consent: true` seulement si les deux sont
// cochées (contrat inchangé). Après l'envoi : « Vérifiez votre boîte mail » et les étapes suivantes.
// Le serveur répond de la même façon que l'adresse soit nouvelle ou non (pas d'énumération de comptes).
import { useState, type FormEvent, type ReactNode } from 'react';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { ResultPanel } from '@/components/layout/ResultPanel';
import { Alert, Button, ButtonLink, Checkbox, TextField, TextLink } from '@/components/ui';
import {
  authApi,
  authErrorMessage,
  doctorPayload,
  validateDoctorSignUp,
  type DoctorSignUpValues,
} from '@/features/auth';
import { PasswordRule } from '@/features/auth/components/PasswordRule';
import { fill, texts } from '@/i18n';

const EMPTY: DoctorSignUpValues = {
  firstName: '',
  lastName: '',
  licenseNumber: '',
  institution: '',
  email: '',
  password: '',
  attest: false, // jamais pré-coché
  terms: false, // jamais pré-coché
};

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <legend className="px-1 text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export default function RegisterRoute() {
  const [values, setValues] = useState<DoctorSignUpValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = <K extends keyof DoctorSignUpValues>(key: K, value: DoctorSignUpValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const fieldErrors = submitted ? validateDoctorSignUp(values) : {};

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    const errors = validateDoctorSignUp(values);
    if (Object.keys(errors).length) {
      // Place le curseur sur le premier champ à corriger (après l'affichage des erreurs).
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setLoading(true);
    try {
      const payload = doctorPayload(values);
      await authApi.registerDoctor(payload);
      setSentTo(payload.email);
      setValues(EMPTY); // le mot de passe ne reste pas en mémoire dans le formulaire
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(authErrorMessage(e, 'register'));
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <ResultPanel
          tone="info"
          title={texts.register.sentTitle}
          actions={
            <ButtonLink to={`/login?email=${encodeURIComponent(sentTo)}`} variant="outline">
              {texts.register.signIn}
            </ButtonLink>
          }
        >
          <p>{fill(texts.register.sentText, { email: sentTo })}</p>
          <ol className="my-2 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            {texts.register.steps.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-[14px] text-ink">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-text">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p>{texts.register.sentNext}</p>
          <p className="text-[13px] text-subtle">{texts.register.sentSpam}</p>
        </ResultPanel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      wide
      overline={texts.register.overline}
      title={texts.register.title}
      subtitle={texts.register.subtitle}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <Fieldset legend={texts.register.identity}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={texts.fields.firstName}
              autoComplete="given-name"
              autoFocus
              value={values.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              error={fieldErrors.firstName}
              disabled={loading}
              maxLength={80}
            />
            <TextField
              label={texts.fields.lastName}
              autoComplete="family-name"
              value={values.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              error={fieldErrors.lastName}
              disabled={loading}
              maxLength={80}
            />
          </div>
        </Fieldset>

        <Fieldset legend={texts.register.practice}>
          <TextField
            label={texts.fields.licenseNumber}
            hint={texts.fields.licenseHint}
            value={values.licenseNumber}
            onChange={(e) => set('licenseNumber', e.target.value)}
            error={fieldErrors.licenseNumber}
            disabled={loading}
            maxLength={40}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <TextField
            label={texts.fields.institution}
            placeholder={texts.fields.institutionPlaceholder}
            autoComplete="organization"
            value={values.institution}
            onChange={(e) => set('institution', e.target.value)}
            error={fieldErrors.institution}
            disabled={loading}
            maxLength={120}
          />
        </Fieldset>

        <Fieldset legend={texts.register.access}>
          <TextField
            label={texts.fields.email}
            placeholder={texts.fields.emailPlaceholder}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            error={fieldErrors.email}
            disabled={loading}
          />
          <div className="flex flex-col gap-2">
            <TextField
              label={texts.fields.password}
              hint={texts.fields.passwordHint}
              secret
              autoComplete="new-password"
              value={values.password}
              onChange={(e) => set('password', e.target.value)}
              error={fieldErrors.password}
              disabled={loading}
              maxLength={128}
            />
            <PasswordRule password={values.password} />
          </div>
        </Fieldset>

        <div className="flex flex-col gap-4 px-1">
          <Checkbox
            checked={values.attest}
            onChange={(checked) => set('attest', checked)}
            error={fieldErrors.attest}
          >
            {texts.register.attest}
          </Checkbox>
          <Checkbox
            checked={values.terms}
            onChange={(checked) => set('terms', checked)}
            error={fieldErrors.terms}
          >
            {texts.register.terms}
          </Checkbox>
        </div>

        <Button type="submit" size="lg" loading={loading}>
          {texts.register.submit}
        </Button>
      </form>

      <p className="text-center text-[14px] text-muted">
        {texts.register.haveAccount} <TextLink to="/login">{texts.register.signIn}</TextLink>
      </p>
    </AuthLayout>
  );
}
