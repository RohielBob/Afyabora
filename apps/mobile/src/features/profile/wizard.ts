// Assistant de profil (L1-08) : logique SANS interface (testée dans __tests__/wizard.test.ts).
//  - le brouillon garde ce que la personne tape (texte), dans l'unité qu'elle a choisie ;
//  - chaque étape est validée avec le schéma du serveur (patientProfileSchema, @glyka/shared) :
//    une seule source pour les règles ; on ne garde que les erreurs des champs de l'étape ;
//  - à la fin, le brouillon devient la requête PUT /me/profile (seuils convertis en mg/dL entiers).
import {
  DEFAULT_THRESHOLDS,
  fromMgDl,
  patientProfileSchema,
  toMgDl,
  type GlucoseUnit,
  type PatientProfileInput,
} from '@glyka/shared';

export const STEPS = ['identity', 'diabetes', 'thresholds', 'contacts', 'summary'] as const;
export type Step = (typeof STEPS)[number];

export type Sex = 'F' | 'M' | 'OTHER';
export type DiabetesType = PatientProfileInput['diabetesType'];
export type ThresholdKey = 'veryLowMgDl' | 'targetMinMgDl' | 'targetMaxMgDl' | 'veryHighMgDl';

/**
 * Pays proposés en un appui (L9-04) : ceux du public d'Afyabora (Kinshasa) et des pays voisins ou
 * francophones les plus probables. « OTHER » ouvre un champ pour le code à 2 lettres de n'importe quel pays.
 * Noms affichés : i18n `onboarding.contacts.countries.<code>`.
 */
export const SUGGESTED_COUNTRIES = ['CD', 'CG', 'RW', 'BI', 'UG', 'AO', 'FR', 'BE'] as const;
export type CountryChoice = (typeof SUGGESTED_COUNTRIES)[number] | 'OTHER';
export const THRESHOLD_KEYS: readonly ThresholdKey[] = [
  'veryLowMgDl',
  'targetMinMgDl',
  'targetMaxMgDl',
  'veryHighMgDl',
];

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  /** Saisie « JJ/MM/AAAA ». */
  birthDate: string;
  sex: Sex | null;
  diabetesType: DiabetesType | null;
  diagnosisYear: string;
  unit: GlucoseUnit;
  /** Valeurs affichées, dans l'unité `unit` (ex. « 0,70 » en g/L). */
  thresholds: Record<ThresholdKey, string>;
  thresholdsReviewedByClinician: boolean;
  relativeName: string;
  relativePhone: string;
  relativeRelation: string;
  doctorName: string;
  doctorPhone: string;
  /** Pays choisi parmi SUGGESTED_COUNTRIES, « OTHER » (code saisi dans `otherCountry`), ou rien (L9-04). */
  country: CountryChoice | null;
  /** Code à 2 lettres saisi quand `country` vaut « OTHER » (« ke » est accepté : mis en majuscules). */
  otherCountry: string;
  /** Numéro d'urgence saisi par le patient : Afyabora ne le devine jamais (L9-04). */
  emergencyNumber: string;
  /**
   * Seuils EXACTS du profil enregistré (modification du profil). Un seuil dont le texte n'a pas changé garde sa
   * valeur en mg/dL : sinon l'arrondi de l'affichage (1 décimale en mmol/L) le décalerait sans que la personne
   * l'ait touché (73 mg/dL → « 4,1 » → 74 mg/dL).
   */
  savedThresholds?: {
    unit: GlucoseUnit;
    display: Record<ThresholdKey, string>;
    mgDl: Record<ThresholdKey, number>;
  };
}

/** Champs (premier niveau du schéma) contrôlés à chaque étape. */
const STEP_FIELDS: Record<Exclude<Step, 'summary'>, readonly string[]> = {
  identity: ['firstName', 'lastName', 'birthDate', 'sex'],
  diabetes: ['diabetesType', 'diagnosisYear'],
  thresholds: ['preferredUnit', 'thresholds', 'thresholdsReviewedByClinician'],
  contacts: ['emergencyContact', 'doctorContact', 'country', 'emergencyNumber'],
};

// ---------- Nombres et unités (affichage à la française : virgule décimale) ----------

const DECIMALS: Record<GlucoseUnit, number> = { G_L: 2, MMOL_L: 1, MG_DL: 0 };

export function formatValue(mgDl: number, unit: GlucoseUnit): string {
  return fromMgDl(mgDl, unit).toFixed(DECIMALS[unit]).replace('.', ',');
}

/** « 0,7 », « 0.70 », « 70 » → nombre ; null si ce n'est pas un nombre. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Valeur affichée → mg/dL entier (null si illisible). */
export function displayToMgDl(text: string, unit: GlucoseUnit): number | null {
  const value = parseNumber(text);
  return value === null ? null : toMgDl(value, unit);
}

export function thresholdsInUnit(
  mgDl: Record<ThresholdKey, number>,
  unit: GlucoseUnit,
): Record<ThresholdKey, string> {
  return Object.fromEntries(
    THRESHOLD_KEYS.map((key) => [key, formatValue(mgDl[key], unit)]),
  ) as Record<ThresholdKey, string>;
}

/** Changement d'unité : chaque seuil lisible est converti ; un seuil illisible reste tel quel. */
export function convertThresholds(
  thresholds: Record<ThresholdKey, string>,
  from: GlucoseUnit,
  to: GlucoseUnit,
): Record<ThresholdKey, string> {
  return Object.fromEntries(
    THRESHOLD_KEYS.map((key) => {
      const mgDl = displayToMgDl(thresholds[key], from);
      return [key, mgDl === null ? thresholds[key] : formatValue(mgDl, to)];
    }),
  ) as Record<ThresholdKey, string>;
}

// ---------- Dates ----------

/** « 14/05/1980 » → « 1980-05-14 » ; renvoie le texte tel quel s'il n'a pas ce format (le schéma le refusera). */
export function birthDateToIso(text: string): string {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return text.trim();
  const [, day, month, year] = match as unknown as [string, string, string, string];
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Ajoute les « / » pendant la frappe : « 14051980 » → « 14/05/1980 ». */
export function maskBirthDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ---------- Brouillon → requête ----------

export function initialDraft(): ProfileDraft {
  return {
    firstName: '',
    lastName: '',
    birthDate: '',
    sex: null,
    diabetesType: null,
    diagnosisYear: '',
    unit: 'G_L', // unité par défaut du cahier des charges
    thresholds: thresholdsInUnit(DEFAULT_THRESHOLDS, 'G_L'),
    thresholdsReviewedByClinician: false,
    relativeName: '',
    relativePhone: '',
    relativeRelation: '',
    doctorName: '',
    doctorPhone: '',
    country: null,
    otherCountry: '',
    emergencyNumber: '',
  };
}

/** « 1980-05-14 » → « 14/05/1980 » (saisie de l'assistant). Un texte d'un autre format reste tel quel. */
export function isoToBirthDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  return `${day}/${month}/${year}`;
}

/**
 * Profil enregistré → brouillon de l'assistant (« Mon profil médical » → Modifier). C'est l'inverse de
 * `toPayload` : le profil renvoyé tel quel redonne EXACTEMENT le même profil (test aller-retour), pour que
 * modifier une seule partie ne change rien aux autres (PUT /me/profile remplace tout le profil).
 */
export function profileToDraft(profile: PatientProfileInput): ProfileDraft {
  const country = profile.country ?? null;
  const suggested = (SUGGESTED_COUNTRIES as readonly string[]).includes(country ?? '');
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: isoToBirthDate(profile.birthDate),
    sex: profile.sex,
    diabetesType: profile.diabetesType,
    diagnosisYear: profile.diagnosisYear === undefined ? '' : String(profile.diagnosisYear),
    unit: profile.preferredUnit,
    thresholds: thresholdsInUnit(profile.thresholds, profile.preferredUnit),
    thresholdsReviewedByClinician: profile.thresholdsReviewedByClinician,
    relativeName: profile.emergencyContact?.name ?? '',
    relativePhone: profile.emergencyContact?.phone ?? '',
    relativeRelation: profile.emergencyContact?.relation ?? '',
    doctorName: profile.doctorContact?.name ?? '',
    doctorPhone: profile.doctorContact?.phone ?? '',
    country: country === null ? null : suggested ? (country as CountryChoice) : 'OTHER',
    otherCountry: country !== null && !suggested ? country : '',
    emergencyNumber: profile.emergencyNumber ?? '',
    savedThresholds: {
      unit: profile.preferredUnit,
      display: thresholdsInUnit(profile.thresholds, profile.preferredUnit),
      mgDl: { ...profile.thresholds },
    },
  };
}

/** Seuil à envoyer, en mg/dL : la valeur exacte enregistrée si son texte n'a pas changé (voir savedThresholds). */
function thresholdMgDl(draft: ProfileDraft, key: ThresholdKey): number | null {
  const saved = draft.savedThresholds;
  if (saved && saved.unit === draft.unit && saved.display[key] === draft.thresholds[key]) {
    return saved.mgDl[key];
  }
  return displayToMgDl(draft.thresholds[key], draft.unit);
}

/**
 * Code pays envoyé à l'API : le choix proposé, ou le code saisi (majuscules) ; null si aucun pays choisi.
 * « Autre » sans code donne « » : le schéma le refuse, et la personne voit l'erreur sous le champ.
 */
export function countryCode(draft: ProfileDraft): string | null {
  if (draft.country === 'OTHER') return draft.otherCountry.trim().toUpperCase();
  return draft.country;
}

/** Construit la requête PUT /me/profile. Les valeurs non valides sont laissées telles quelles : le schéma les refuse. */
export function toPayload(draft: ProfileDraft): Record<string, unknown> {
  const year = draft.diagnosisYear.trim();
  const relative = [draft.relativeName, draft.relativePhone, draft.relativeRelation].some((v) =>
    v.trim(),
  );
  const doctor = [draft.doctorName, draft.doctorPhone].some((v) => v.trim());
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    birthDate: birthDateToIso(draft.birthDate),
    sex: draft.sex ?? undefined,
    diabetesType: draft.diabetesType ?? undefined,
    ...(year ? { diagnosisYear: /^\d{4}$/.test(year) ? Number(year) : year } : {}),
    preferredUnit: draft.unit,
    thresholds: Object.fromEntries(
      THRESHOLD_KEYS.map((key) => [key, thresholdMgDl(draft, key) ?? NaN]),
    ),
    thresholdsReviewedByClinician: draft.thresholdsReviewedByClinician,
    // Un contact n'est envoyé que si au moins un de ses champs est rempli (alors nom ET téléphone sont exigés).
    ...(relative
      ? {
          emergencyContact: {
            name: draft.relativeName,
            phone: draft.relativePhone,
            ...(draft.relativeRelation.trim() ? { relation: draft.relativeRelation } : {}),
          },
        }
      : {}),
    ...(doctor ? { doctorContact: { name: draft.doctorName, phone: draft.doctorPhone } } : {}),
    // L9-04 : pays et numéro d'urgence, envoyés seulement s'ils sont renseignés (le schéma vérifie le format).
    ...(draft.country !== null ? { country: countryCode(draft) } : {}),
    ...(draft.emergencyNumber.trim() ? { emergencyNumber: draft.emergencyNumber } : {}),
  };
}

// ---------- Validation ----------

/** Erreurs d'une étape : chemin du champ (ex. « thresholds.veryLowMgDl ») → clé i18n du message. */
export type StepErrors = Record<string, string>;

export function validateStep(step: Step, draft: ProfileDraft): StepErrors {
  const result = patientProfileSchema.safeParse(toPayload(draft));
  if (result.success) return {};
  const fields = step === 'summary' ? null : STEP_FIELDS[step];
  const errors: StepErrors = {};
  for (const issue of result.error.issues) {
    const root = String(issue.path[0] ?? '');
    if (fields && !fields.includes(root)) continue;
    const path = issue.path.join('.');
    errors[path] ??= `onboarding.errors.${path}`;
  }
  return errors;
}

/** Profil prêt à envoyer (toutes les étapes valides), ou null. */
export function finalPayload(draft: ProfileDraft): PatientProfileInput | null {
  const result = patientProfileSchema.safeParse(toPayload(draft));
  return result.success ? result.data : null;
}

/** Première étape qui contient une erreur (pour y ramener la personne depuis le résumé). */
export function firstInvalidStep(draft: ProfileDraft): Step | null {
  for (const step of STEPS) {
    if (step !== 'summary' && Object.keys(validateStep(step, draft)).length) return step;
  }
  return null;
}
