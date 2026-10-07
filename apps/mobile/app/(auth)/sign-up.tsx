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
  inRange: '#2E8B57',
};

// Règle du cahier des charges (F1) : 12 caractères minimum.
const PASSWORD_MIN_LENGTH = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false); // jamais pré-coché
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const emailError = !EMAIL_REGEX.test(email.trim()) ? 'Saisissez une adresse email valide.' : null;
  const passwordError =
    password.length < PASSWORD_MIN_LENGTH
      ? `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
      : null;
  const consentError = !consent ? 'Le consentement est obligatoire pour créer un compte.' : null;

  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/welcome');
  };

  const onSubmit = () => {
    setSubmitted(true);
    setNotice(null);
    if (emailError || passwordError || consentError) return;
    // TODO(L1-06) : appeler POST /auth/register { email, password, consent: true },
    // puis router.push('/(auth)/verify-email').
    setNotice("L'inscription auprès du serveur n'est pas encore branchée (ticket L1-06).");
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
              <Text style={styles.title}>Créer un compte</Text>
              <Text style={styles.subtitle}>
                Quelques secondes pour commencer à suivre votre glycémie.
              </Text>
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
                    placeholder={`${PASSWORD_MIN_LENGTH} caractères minimum`}
                    placeholderTextColor="#8FA19B"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
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

                {/* Compteur en direct : symbole + texte, jamais la couleur seule */}
                <Text style={[styles.hint, passwordOk ? styles.hintOk : null]}>
                  {passwordOk ? '✓' : '○'} {password.length} / {PASSWORD_MIN_LENGTH} caractères
                  minimum
                </Text>

                {submitted && passwordError ? (
                  <Text style={styles.errorText}>⚠ {passwordError}</Text>
                ) : null}
              </View>

              {/* Consentement explicite, non pré-coché */}
              <View style={styles.field}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}
                  accessibilityLabel="J'accepte la politique de confidentialité et je comprends que Glyka est un outil d'aide, pas un avis médical"
                  onPress={() => setConsent((v) => !v)}
                  style={styles.consentRow}
                >
                  <View style={[styles.checkbox, consent ? styles.checkboxChecked : null]}>
                    {consent ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.consentText}>
                    J'accepte la politique de confidentialité et je comprends que Glyka est un outil
                    d'aide au suivi, pas un avis médical.
                  </Text>
                </Pressable>
                {submitted && consentError ? (
                  <Text style={styles.errorText}>⚠ {consentError}</Text>
                ) : null}
              </View>

              {notice ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>ℹ {notice}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Créer mon compte"
                onPress={onSubmit}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Créer mon compte</Text>
              </Pressable>
            </View>

            {/* Bas de page */}
            <View style={styles.footer}>
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Déjà un compte ? </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Se connecter"
                  onPress={() => router.replace('/(auth)/sign-in')}
                >
                  <Text style={styles.linkText}>Se connecter</Text>
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
  hint: {
    fontSize: 12,
    color: C.textMuted,
  },
  hintOk: {
    color: C.inRange,
    fontWeight: '600',
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
  },
  linkText: {
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 48,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.primary,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: C.primary,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: C.text,
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
