// Mot de passe oublié (L1-06, API L1-03), en trois étapes sur le même écran :
//  1. « request » : saisir son adresse → le serveur répond pareil que le compte existe ou non ;
//  2. « reset »   : coller le lien reçu + choisir le nouveau mot de passe (12 caractères min.) ;
//  3. « done »    : succès, toutes les autres sessions ont été fermées → se connecter.
// Le passage d'une étape à l'autre est animé (fondu + légère montée).
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, InlineAlert, Screen, TextField } from '@/components/ui';
import {
  AuthHeader,
  PasswordChecklist,
  SuccessState,
  authApi,
  authErrorMessage,
  extractToken,
  validateEmail,
  validateNewPassword,
  type ErrorMessage,
} from '@/features/auth';
import { enterFromBelow, spacing, useReducedMotion } from '@/theme';

type Step = 'request' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();

  // Ouvert avec ?token=… (lien de l'email) : on passe directement au choix du mot de passe.
  const [step, setStep] = useState<Step>(params.token ? 'reset' : 'request');
  const [email, setEmail] = useState(params.email ?? '');
  const [link, setLink] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);

  const emailError = submitted && step === 'request' ? validateEmail(email) : undefined;
  const linkError =
    submitted && step === 'reset' && !extractToken(link) ? 'auth.validation.link' : undefined;
  const passwordError = submitted && step === 'reset' ? validateNewPassword(password) : undefined;

  const go = (next: Step) => {
    setSubmitted(false);
    setError(null);
    setStep(next);
  };

  const onRequest = async () => {
    setSubmitted(true);
    setError(null);
    const value = email.trim().toLowerCase();
    if (validateEmail(value)) return;
    setLoading(true);
    try {
      await authApi.forgotPassword(value);
      setEmail(value);
      go('reset');
    } catch (e) {
      setError(authErrorMessage(e, 'forgot'));
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    setSubmitted(true);
    setError(null);
    const token = extractToken(link);
    if (!token || validateNewPassword(password)) return;
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setPassword('');
      go('done');
    } catch (e) {
      setError(authErrorMessage(e, 'reset'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <Screen>
        <SuccessState
          title={t('auth.forgot.successTitle')}
          message={t('auth.forgot.successMessage')}
          actionLabel={t('auth.signIn.submit')}
          onAction={() =>
            router.replace(
              email ? { pathname: '/(auth)/sign-in', params: { email } } : '/(auth)/sign-in',
            )
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Un seul en-tête : son icône et ses textes changent avec l'étape (pas deux en-têtes échangés). */}
      <AuthHeader
        icon={step === 'request' ? 'key-outline' : 'lock-open-outline'}
        title={step === 'request' ? t('auth.forgot.title') : t('auth.forgot.resetTitle')}
        subtitle={step === 'request' ? t('auth.forgot.subtitle') : t('auth.forgot.resetHelp')}
      />

      {error ? (
        <InlineAlert tone="danger" message={t(error.key, error.params)} />
      ) : step === 'reset' && email ? (
        <InlineAlert
          tone="success"
          title={t('auth.forgot.sentTitle')}
          message={t('auth.forgot.sentMessage', { email })}
        />
      ) : null}

      {/* key = étape : le formulaire de la nouvelle étape apparaît avec l'animation d'entrée. */}
      <Animated.View key={step} entering={enterFromBelow(1, reduced)} style={{ gap: spacing.lg }}>
        {step === 'request' ? (
          <>
            <TextField
              label={t('auth.fields.email')}
              placeholder={t('auth.fields.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              error={emailError && t(emailError)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={onRequest}
              editable={!loading}
            />
            <Button
              label={t('auth.forgot.submit')}
              size="lg"
              loading={loading}
              onPress={onRequest}
            />
          </>
        ) : (
          <>
            <TextField
              label={t('auth.fields.link')}
              placeholder={t('auth.fields.linkPlaceholder')}
              value={link}
              onChangeText={setLink}
              error={linkError && t(linkError)}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <View style={{ gap: spacing.sm }}>
              <TextField
                label={t('auth.fields.newPassword')}
                value={password}
                onChangeText={setPassword}
                secret
                error={passwordError && t(passwordError)}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={onReset}
                hint={t('auth.password.hint')}
                editable={!loading}
              />
              <PasswordChecklist password={password} />
            </View>
            <Button
              label={t('auth.forgot.resetSubmit')}
              size="lg"
              loading={loading}
              onPress={onReset}
            />
            <Button
              label={t('auth.forgot.changeEmail')}
              variant="ghost"
              onPress={() => go('request')}
            />
          </>
        )}
      </Animated.View>
    </Screen>
  );
}
