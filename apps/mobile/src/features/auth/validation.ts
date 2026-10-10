// Validation des formulaires AVANT l'envoi, avec les MÊMES schémas Zod que le serveur (@glyka/shared) :
// une règle (ex. 12 caractères) n'est écrite qu'à un seul endroit. Les messages affichés viennent de i18n.
import {
  PASSWORD_MIN_LENGTH,
  emailSchema,
  loginSchema,
  passwordSchema,
  registerPatientSchema,
} from '@glyka/shared';

export type FieldErrors<F extends string> = Partial<Record<F, string>>; // valeur = clé i18n

export { PASSWORD_MIN_LENGTH };

export function validateEmail(email: string): string | undefined {
  return emailSchema.safeParse(email).success ? undefined : 'auth.validation.email';
}

export function validateNewPassword(password: string): string | undefined {
  return passwordSchema.safeParse(password).success ? undefined : 'auth.validation.passwordLength';
}

// Deux cases distinctes (L1-10), jamais pré-cochées : l'accord sur les données de santé, et la lecture de
// l'avertissement « outil d'aide, pas un avis médical ». Le serveur ne reçoit qu'un `consent: true`
// (contrat inchangé), envoyé seulement quand les DEUX sont cochées.
export function validateSignUp(values: {
  email: string;
  password: string;
  consent: boolean;
  disclaimer: boolean;
}): FieldErrors<'email' | 'password' | 'consent' | 'disclaimer'> {
  const errors: FieldErrors<'email' | 'password' | 'consent' | 'disclaimer'> = {};
  const email = validateEmail(values.email);
  const password = validateNewPassword(values.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  if (!values.consent) errors.consent = 'auth.validation.consent';
  if (!values.disclaimer) errors.disclaimer = 'auth.validation.disclaimer';
  // Vérification finale par le schéma complet du serveur (garde-fou si une règle y est ajoutée).
  const payload = { email: values.email, password: values.password, consent: values.consent };
  if (!Object.keys(errors).length && !registerPatientSchema.safeParse(payload).success) {
    errors.email = 'errors.invalidData';
  }
  return errors;
}

export function validateSignIn(values: {
  email: string;
  password: string;
}): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'auth.validation.passwordRequired';
  if (!Object.keys(errors).length && !loginSchema.safeParse(values).success) {
    errors.email = 'errors.invalidData';
  }
  return errors;
}

/**
 * Règles du mot de passe affichées en direct pendant la saisie (liste à cocher).
 * Exactement les règles du serveur (passwordSchema) : 12 caractères minimum, 128 maximum.
 */
export function passwordChecks(password: string) {
  return [{ key: 'auth.password.ruleLength', ok: password.length >= PASSWORD_MIN_LENGTH }];
}
