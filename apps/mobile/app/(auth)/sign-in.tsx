import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Palette alignée sur @glyka/ui-tokens.
// TODO : remplacer par l'import des tokens (ticket L7-03/L7-05).
const C = {
  primary: '#0B6E6E',
  primaryLight: '#D7EEEE',
  background: '#F7FAFA',
  surface: '#FFFFFF',
  text: '#10231F',
  textMuted: '#52665F',
  border: '#D6E2E0',
  danger: '#C0392B',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const emailError = !EMAIL_REGEX.test(email.trim()) ? 'Saisissez une adresse email valide.' : null;
  const passwordError = password.length === 0 ? 'Saisissez votre mot de passe.' : null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/welcome');
  };

  const onSubmit = () => {
    setSubmitted(true);
    setNotice(null);
    if (emailError || passwordError) return;
    // TODO(L1-07) : appeler POST /auth/login, stocker les jetons (SecureStore), rediriger selon la session.
    setNotice("La connexion au serveur n'est pas encore branchée (ticket L1-07).");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            {/* Retour */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={goBack}
              style={styles.backButton}
            >
              <Text style={styles.backText}>← Retour</Text>
            </Pressable>

            {/* En-tête */}
            <View style={styles.header}>
              <View style={styles.logoSquare}>
                <Text style={styles.logoLetter}>G</Text>
              </View>
              <Text style={styles.title}>Bon retour</Text>
              <Text style={styles.subtitle}>Connectez-vous pour retrouver votre historique.</Text>
            </View>

            {/* Formulaire */}
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Adresse email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nom@exemple.com"
                  placeholderTextColor="#8FA19B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  accessibilityLabel="Adresse email"
                  style={[styles.input, submitted && emailError ? styles.inputError : null]}
                />
                {submitted && emailError ? (
                  <Text style={styles.errorText}>⚠ {emailError}</Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Mot de passe</Text>
                <View
                  style={[
                    styles.passwordRow,
                    submitted && passwordError ? styles.inputError : null,
                  ]}
                >
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Votre mot de passe"
                    placeholderTextColor="#8FA19B"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    accessibilityLabel="Mot de passe"
                    style={styles.passwordInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                    }
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.toggleButton}
                  >
                    <Text style={styles.toggleText}>{showPassword ? 'Masquer' : 'Afficher'}</Text>
                  </Pressable>
                </View>
                {submitted && passwordError ? (
                  <Text style={styles.errorText}>⚠ {passwordError}</Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Mot de passe oublié"
                onPress={() => router.push('/(auth)/forgot-password')}
                style={styles.forgotLink}
              >
                <Text style={styles.linkText}>Mot de passe oublié ?</Text>
              </Pressable>

              {notice ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>ℹ {notice}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Se connecter"
                onPress={onSubmit}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Se connecter</Text>
              </Pressable>
            </View>

            {/* Bas de page */}
            <View style={styles.footer}>
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Pas encore de compte ? </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Créer un compte"
                  onPress={() => router.replace('/(auth)/sign-up')}
                >
                  <Text style={styles.linkText}>Créer un compte</Text>
                </Pressable>
              </View>

              <Text style={styles.disclaimer}>
                Glyka est un outil d'aide au suivi. Il ne remplace pas l'avis d'un professionnel de
                santé.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 20,
  },

  backButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
  backText: {
    color: C.primary,
    fontSize: 15,
    fontWeight: '600',
  },

  header: {
    alignItems: 'center',
  },
  logoSquare: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoLetter: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: C.textMuted,
    textAlign: 'center',
  },

  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  inputError: {
    borderColor: C.danger,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  passwordInput: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
  },
  toggleButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  toggleText: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    minHeight: 40,
    justifyContent: 'center',
  },
  linkText: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  notice: {
    backgroundColor: C.primaryLight,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },

  footer: {
    marginTop: 'auto',
    gap: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  switchText: {
    color: C.textMuted,
    fontSize: 14,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    color: C.textMuted,
    textAlign: 'center',
  },
});
