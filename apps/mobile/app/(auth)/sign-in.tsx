// Connexion (L1-06, API L1-02). Messages selon la réponse du serveur :
//  - 401 : « email ou mot de passe incorrect » (même message dans les deux cas, voulu) ;
//  - 403 EMAIL_NOT_VERIFIED : proposition d'aller vérifier l'adresse ;
//  - 429 ACCOUNT_LOCKED : durée du blocage ;
//  - compte médecin / admin : orientation vers le portail (l'app mobile est réservée aux patients).
// Réussite : jetons enregistrés dans le stockage sécurisé, puis assistant de profil ou accueil.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, InlineAlert, Screen, Text, TextField } from '@/components/ui';
import {
  AuthHeader,
  FooterLink,
  authApi,
  authErrorMessage,
  completeLogin,
  validateSignIn,
  type ErrorMessage,
} from '@/features/auth';
import { enterFromBelow, spacing, useReducedMotion } from '@/theme';

export default function SignInScreen() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ email?: string }>();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);

  const fieldErrors = submitted ? validateSignIn({ email, password }) : {};

  const onSubmit = async () => {
    setSubmitted(true);
    setError(null);
    const values = { email: email.trim().toLowerCase(), password };
    if (Object.keys(validateSignIn(values)).length) return;

    setLoading(true);
    try {
      const destination = await completeLogin(await authApi.login(values));
      if (destination === 'notPatient') {
        setError({ key: 'auth.errors.notPatient' });
        return;
      }
      setPassword(''); // le mot de passe ne reste pas en mémoire de l'écran
      router.replace(destination === 'onboarding' ? '/(onboarding)/profile-setup' : '/(tabs)');
    } catch (e) {
      setError(authErrorMessage(e, 'login'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')} />

      {error ? (
        <InlineAlert
          tone={error.key === 'auth.errors.notPatient' ? 'info' : 'danger'}
          message={t(error.key, error.params)}
          actionLabel={error.action === 'verifyEmail' ? t('auth.signIn.verifyAction') : undefined}
          onAction={
            error.action === 'verifyEmail'
              ? () =>
                  router.push({
                    pathname: '/(auth)/verify-email',
                    params: { email: email.trim().toLowerCase() },
                  })
              : undefined
          }
        />
      ) : null}

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
          textContentType="username"
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
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            editable={!loading}
          />
          <Text
            variant="label"
            tone="primary"
            accessibilityRole="link"
            onPress={() =>
              router.push({
                pathname: '/(auth)/forgot-password',
                params: { email: email.trim().toLowerCase() },
              })
            }
            style={{ alignSelf: 'flex-end', paddingVertical: spacing.xs }}
          >
            {t('auth.signIn.forgot')}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={enterFromBelow(2, reduced)} style={{ gap: spacing.sm }}>
        <Button label={t('auth.signIn.submit')} size="lg" loading={loading} onPress={onSubmit} />
        <FooterLink
          question={t('auth.signIn.noAccount')}
          action={t('auth.signIn.signUp')}
          onPress={() => router.replace('/(auth)/sign-up')}
        />
      </Animated.View>
    </Screen>
  );
}
