// Règles de l'authentification médecin (L1-11), sans interface : validation des formulaires avec les
// MÊMES schémas que le serveur (@glyka/shared), message clair pour chaque erreur de l'API, choix de la
// page après connexion, lecture du jeton d'un lien reçu par email. Testées dans __tests__/auth.test.ts.
import {
  emailSchema,
  passwordSchema,
  registerDoctorSchema,
  type DoctorVerificationStatus,
  type UserRole,
} from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import { fill, fr } from '@/i18n/fr';

// ---------- Utilisateur connecté ----------

export interface PortalUser {
  id: string;
  role: UserRole;
  status: DoctorVerificationStatus | null;
  /** Adresse saisie à la connexion (affichée dans l'en-tête ; l'API ne la renvoie pas). */
  email: string;
}

/** Page après connexion (ou au retour sur le portail). */
export type Destination = 'patients' | 'pending' | 'notDoctor';

export function destinationFor(user: Pick<PortalUser, 'role' | 'status'>): Destination {
  if (user.role !== 'DOCTOR') return 'notDoctor'; // patient ou admin : pas d'accès au portail médecin
  return user.status === 'APPROVED' ? 'patients' : 'pending'; // PENDING et REJECTED : aucun dossier
}

export const PATHS: Record<Exclude<Destination, 'notDoctor'>, string> = {
  patients: '/patients',
  pending: '/pending',
};

// ---------- Formulaires ----------

export type FieldErrors<F extends string> = Partial<Record<F, string>>; // valeur = texte affiché

export interface DoctorSignUpValues {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  institution: string;
  email: string;
  password: string;
  /** « Je certifie être un professionnel de santé » */
  attest: boolean;
  /** « Je respecte le secret médical, accès journalisés » */
  terms: boolean;
}

type SignUpField = keyof DoctorSignUpValues;

/** Valeurs envoyées à l'API (espaces retirés, email en minuscules). */
export function doctorPayload(values: DoctorSignUpValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    licenseNumber: values.licenseNumber.trim(),
    institution: values.institution.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    consent: true as const, // envoyé seulement quand les DEUX cases sont cochées (contrat inchangé)
  };
}

export function validateEmail(email: string): string | undefined {
  return emailSchema.safeParse(email.trim().toLowerCase()).success
    ? undefined
    : fr.validation.email;
}

export function validateNewPassword(password: string): string | undefined {
  return passwordSchema.safeParse(password).success ? undefined : fr.validation.passwordLength;
}

export function validateDoctorSignUp(values: DoctorSignUpValues): FieldErrors<SignUpField> {
  const errors: FieldErrors<SignUpField> = {};
  if (!values.firstName.trim()) errors.firstName = fr.validation.firstName;
  if (!values.lastName.trim()) errors.lastName = fr.validation.lastName;
  if (values.licenseNumber.trim().length < 3) errors.licenseNumber = fr.validation.licenseNumber;
  if (values.institution.trim().length < 2) errors.institution = fr.validation.institution;
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  const password = validateNewPassword(values.password);
  if (password) errors.password = password;
  if (!values.attest) errors.attest = fr.validation.attest;
  if (!values.terms) errors.terms = fr.validation.terms;
  // Garde-fou : le schéma complet du serveur (une règle ajoutée côté serveur sera vue ici aussi).
  if (
    !Object.keys(errors).length &&
    !registerDoctorSchema.safeParse(doctorPayload(values)).success
  ) {
    errors.email = fr.errors.invalidData;
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
  if (!values.password) errors.password = fr.validation.passwordRequired;
  return errors;
}

// ---------- Erreurs de l'API ----------

export type AuthContext = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

/** Message à afficher : dire QUOI FAIRE, sans détail technique ni révéler si un compte existe. */
export function authErrorMessage(error: unknown, context: AuthContext): string {
  if (!(error instanceof ApiError)) return fr.errors.unexpected;
  if (error.status === 0) return fr.errors.network;
  if (error.code === 'ACCOUNT_LOCKED') {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 600) / 60));
    return fill(fr.errors.locked, { minutes });
  }
  if (error.status === 429) return fr.errors.tooManyRequests;
  if (error.code === 'EMAIL_NOT_VERIFIED') return fr.errors.emailNotVerified;
  if (error.code === 'TOKEN_INVALID') {
    return context === 'reset' ? fr.errors.resetLinkInvalid : fr.errors.verifyLinkInvalid;
  }
  if (context === 'login' && error.status === 401) return fr.errors.invalidCredentials;
  if (error.status === 400) return fr.errors.invalidData;
  if (error.status >= 500) return fr.errors.server;
  return fr.errors.unexpected;
}

// ---------- Liens reçus par email ----------

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/; // jeton opaque (base64url), voir l'API

/** Jeton d'une adresse « …?token=XXXX » ; null s'il est absent ou mal formé. */
export function tokenFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get('token');
  return token && TOKEN.test(token) ? token : null;
}

// ---------- Session enregistrée dans l'onglet ----------

export interface StoredSession {
  refreshToken: string;
  user: PortalUser;
  /** Dernière activité (ms) : au-delà de IDLE_LIMIT_MS, la session n'est pas reprise. */
  lastActive: number;
}

/** Déconnexion automatique après 30 min sans activité (poste partagé en consultation). */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

const ROLES: readonly string[] = ['PATIENT', 'DOCTOR', 'ADMIN'];
const STATUSES: readonly string[] = ['PENDING', 'APPROVED', 'REJECTED'];

/** Lit une session enregistrée ; null si absente, abîmée ou trop ancienne. */
export function parseStoredSession(raw: string | null, now: number): StoredSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession>;
    const user = value.user as Partial<PortalUser> | undefined;
    if (
      typeof value.refreshToken !== 'string' ||
      typeof value.lastActive !== 'number' ||
      !user ||
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      !ROLES.includes(user.role as string) ||
      (user.status !== null && !STATUSES.includes(user.status as string))
    ) {
      return null;
    }
    if (now - value.lastActive > IDLE_LIMIT_MS) return null;
    return {
      refreshToken: value.refreshToken,
      lastActive: value.lastActive,
      user: {
        id: user.id,
        role: user.role as UserRole,
        status: (user.status ?? null) as DoctorVerificationStatus | null,
        email: user.email,
      },
    };
  } catch {
    return null;
  }
}
