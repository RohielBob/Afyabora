// Inscription patient (L1-06, API L1-01) : email, mot de passe (12 caractères min.), consentement explicite
// jamais pré-coché. Les règles sont celles du serveur (@glyka/shared). Après l'envoi : écran « Vérifiez
// votre boîte mail ». Le serveur répond de la même façon que l'adresse soit nouvelle ou non.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Checkbox, InlineAlert, Screen, TextField } from '@/components/ui';
import {
  AuthHeader,
  FooterLink,
  PasswordChecklist,
  authApi,
  authErrorMessage,
  pendingRegistration,
  validateSignUp,
  type ErrorMessage,
} from '@/features/auth';
import { enterFromBelow, spacing, useReducedMotion } from '@/theme';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false); // jamais pré-coché (CDC F1)
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);

  // Les erreurs de champ n'apparaissent qu'après un premier essai, puis se mettent à jour en direct.
  const fieldErrors = submitted ? validateSignUp({ email, password, consent }) : {};

  const onSubmit = async () => {
    setSubmitted(true);
    setError(null);
    const values = { email: email.trim().toLowerCase(), password, consent };
    if (Object.keys(validateSignUp(values)).length) return;

    setLoading(true);
    try {
      await authApi.register({ ...values, consent: true });
      pendingRegistration.set({ ...values, consent: true }); // en mémoire, pour « Renvoyer l'email »
      router.push({ pathname: '/(auth)/verify-email', params: { email: values.email } });
    } catch (e) {
      setError(authErrorMessage(e, 'register'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} />

      {error ? <InlineAlert tone="danger" message={t(error.key, error.params)} /> : null}

      <Animated.View entering={enterFromBelow(1, reduced)} style={{ gap: spacing.lg }}>
        <TextField
          label={t('auth.fields.email')}
          placeholder={t('auth.fields.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email && t(fieldErrors.email)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
        />
        <View style={{ gap: spacing.sm }}>
          <TextField
            ref={passwordRef}
            label={t('auth.fields.password')}
            value={password}
            onChangeText={setPassword}
            secret
            error={fieldErrors.password && t(fieldErrors.password)}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            hint={t('auth.password.hint')}
            editable={!loading}
          />
          <PasswordChecklist password={password} />
        </View>
        <Checkbox
          checked={consent}
          onChange={setConsent}
          label={t('auth.signUp.consent')}
          accessibilityLabel={t('auth.signUp.consentA11y')}
          error={fieldErrors.consent && t(fieldErrors.consent)}
        />
      </Animated.View>

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
        <Button label={t('auth.signUp.submit')} size="lg" loading={loading} onPress={onSubmit} />
        <FooterLink
          question={t('auth.signUp.haveAccount')}
          action={t('auth.signUp.signIn')}
          onPress={() => router.replace('/(auth)/sign-in')}
        />
      </Animated.View>
    </Screen>
  );
}
