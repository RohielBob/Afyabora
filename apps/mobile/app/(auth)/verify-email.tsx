// Vérification de l'adresse email (L1-06, API L1-01).
// - Le lien de l'email ouvre la page du portail ; si l'app est ouverte avec ?token=…, la vérification est
//   automatique. Sinon, la personne colle le lien (ou le code) dans le champ.
// - « Renvoyer l'email » refait l'inscription avec les données gardées en mémoire (pas de nouvelle route API),
//   avec un délai de 60 s entre deux envois.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, InlineAlert, Screen, Text, TextField } from '@/components/ui';
import {
  AuthHeader,
  SuccessState,
  authApi,
  authErrorMessage,
  extractToken,
  pendingRegistration,
  useCountdown,
  type ErrorMessage,
} from '@/features/auth';
import { enterFromBelow, fadeIn, spacing, useReducedMotion } from '@/theme';

const RESEND_DELAY_S = 60;

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const email = params.email ?? '';

  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const countdown = useCountdown();
  const { start } = countdown;

  const verify = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.verifyEmail(token);
      pendingRegistration.clear();
      setVerified(true);
    } catch (e) {
      setError(authErrorMessage(e, 'verify'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Arrivée depuis l'inscription : l'email vient de partir, on attend avant de proposer un renvoi.
  useEffect(() => {
    if (pendingRegistration.get(email)) start(RESEND_DELAY_S);
  }, [email, start]);

  // Ouverture par un lien contenant le jeton : vérification automatique.
  useEffect(() => {
    if (params.token) void verify(params.token);
  }, [params.token, verify]);

  const onSubmit = () => {
    const token = extractToken(link);
    if (!token) {
      setLinkError(t('auth.validation.link'));
      return;
    }
    setLinkError(undefined);
    void verify(token);
  };

  const onResend = async () => {
    setError(null);
    setNotice(null);
    const registration = pendingRegistration.get(email);
    if (!registration) {
      setNotice(t('auth.verify.resendUnavailable'));
      return;
    }
    try {
      await authApi.register(registration);
      setNotice(t('auth.verify.resent'));
      start(RESEND_DELAY_S);
    } catch (e) {
      setError(authErrorMessage(e, 'register'));
    }
  };

  const goToSignIn = () =>
    router.replace(email ? { pathname: '/(auth)/sign-in', params: { email } } : '/(auth)/sign-in');

  if (verified) {
    return (
      <Screen>
        <SuccessState
          title={t('auth.verify.successTitle')}
          message={t('auth.verify.successMessage')}
          actionLabel={t('auth.verify.goToSignIn')}
          onAction={goToSignIn}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader
        icon="mail-unread-outline"
        title={t('auth.verify.title')}
        subtitle={email ? t('auth.verify.subtitle', { email }) : t('auth.verify.subtitleNoEmail')}
      />

      <Card variant="tinted" index={1}>
        <Text variant="bodySmall">{t('auth.verify.steps')}</Text>
      </Card>

      {error ? (
        <InlineAlert tone="danger" message={t(error.key, error.params)} />
      ) : notice ? (
        <InlineAlert tone="info" message={notice} />
      ) : null}

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="subheading">{t('auth.verify.pasteTitle')}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('auth.verify.pasteHelp')}
          </Text>
        </View>
        <TextField
          label={t('auth.fields.link')}
          placeholder={t('auth.fields.linkPlaceholder')}
          value={link}
          onChangeText={setLink}
          error={linkError}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          editable={!loading}
        />
        <Button label={t('auth.verify.submit')} size="lg" loading={loading} onPress={onSubmit} />
        <Animated.View key={String(countdown.running)} entering={fadeIn(reduced)}>
          <Button
            label={
              countdown.running
                ? t('auth.verify.resendIn', { seconds: countdown.seconds })
                : t('auth.verify.resend')
            }
            variant="ghost"
            disabled={countdown.running}
            onPress={onResend}
          />
        </Animated.View>
        {/* Adresse DÉJÀ inscrite et vérifiée : le serveur n'envoie rien (il ne révèle jamais si un compte
            existe). On le dit ici, pour tout le monde, avec le bouton de connexion. */}
        <Text variant="bodySmall" tone="muted" style={{ textAlign: 'center' }}>
          {t('auth.verify.alreadyAccount')}
        </Text>
        <Button label={t('auth.verify.goToSignIn')} variant="outline" onPress={goToSignIn} />
      </Animated.View>
    </Screen>
  );
}
