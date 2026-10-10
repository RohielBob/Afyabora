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

export function validateSignUp(values: {
  email: string;
  password: string;
  consent: boolean;
}): FieldErrors<'email' | 'password' | 'consent'> {
  const errors: FieldErrors<'email' | 'password' | 'consent'> = {};
  const email = validateEmail(values.email);
  const password = validateNewPassword(values.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  if (!values.consent) errors.consent = 'auth.validation.consent';
  // Vérification finale par le schéma complet du serveur (garde-fou si une règle y est ajoutée).
  if (!Object.keys(errors).length && !registerPatientSchema.safeParse(values).success) {
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
