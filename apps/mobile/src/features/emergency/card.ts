// Carte d'urgence (L6-06, CDC F10) : la LOGIQUE, sans interface (testée dans __tests__/card.test.ts).
//  - Le patient choisit CHAQUE champ ; un champ vide n'est jamais montré au secouriste.
//  - Propositions (choix de l'équipe) : nom, type de diabète et contact viennent du profil ; la dernière
//    glycémie vient de la dernière mesure. Rien n'est rempli sans que le patient le demande.
//  - La glycémie se saisit dans l'unité du patient ; la carte la garde en mg/dL entier (ADR-0002).
//  - Le QR : le serveur ne garde que l'empreinte du jeton ; le TÉLÉPHONE garde le jeton (stockage chiffré).
//    Un QR généré sur un autre téléphone (ou avant une réinstallation) existe mais ne peut pas être affiché
//    ici : il faut en générer un nouveau (l'ancien cessera de marcher).
import {
  EMERGENCY_CARD_FIELDS,
  formatGlucose,
  fromMgDl,
  parseDecimal,
  toMgDl,
  type DiabetesType,
  type EmergencyCardField,
  type EmergencyCardInput,
  type EmergencyCardResponse,
  type GlucoseUnit,
} from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

/** Groupes sanguins proposés (contrat : EmergencyCardRequest.bloodGroup). */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/** Limites du contrat (au-delà, le serveur refuse : on le dit avant d'envoyer). */
export const LIMITS = {
  fullName: 120,
  diabetesType: 40,
  declaredTreatment: 200,
  allergies: 200,
  emergencyContactName: 120,
  emergencyContactPhone: 30,
} as const;
const GLUCOSE_MIN = 20;
const GLUCOSE_MAX = 600;

/** Le formulaire : du texte, tel que le patient le tape. */
export interface CardDraft {
  fullName: string;
  diabetesType: string;
  declaredTreatment: string;
  allergies: string;
  bloodGroup: BloodGroup | null;
  /** Dans l'unité du patient (« 1,32 » en g/L). */
  glucose: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export const EMPTY_DRAFT: CardDraft = {
  fullName: '',
  diabetesType: '',
  declaredTreatment: '',
  allergies: '',
  bloodGroup: null,
  glucose: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
};

/** Décimales affichées par unité (comme la saisie d'une mesure). */
const DECIMALS: Record<GlucoseUnit, number> = { G_L: 2, MG_DL: 0, MMOL_L: 1 };

/** Valeur en mg/dL ⇒ texte dans l'unité du patient (« 1,32 »). */
export function glucoseInput(mgDl: number, unit: GlucoseUnit): string {
  return fromMgDl(mgDl, unit).toFixed(DECIMALS[unit]).replace('.', ',');
}

/** La carte enregistrée ⇒ formulaire. */
export function draftFromCard(card: EmergencyCardResponse, unit: GlucoseUnit): CardDraft {
  return {
    fullName: card.fullName ?? '',
    diabetesType: card.diabetesType ?? '',
    declaredTreatment: card.declaredTreatment ?? '',
    allergies: card.allergies ?? '',
    bloodGroup: card.bloodGroup ?? null,
    glucose:
      card.lastKnownGlucoseMgDl === undefined ? '' : glucoseInput(card.lastKnownGlucoseMgDl, unit),
    emergencyContactName: card.emergencyContactName ?? '',
    emergencyContactPhone: card.emergencyContactPhone ?? '',
  };
}

export type DraftError = 'tooLong' | 'glucoseInvalid' | 'glucoseRange' | 'phoneInvalid';
export type DraftErrors = Partial<Record<keyof CardDraft, DraftError>>;

/** Un numéro composable : chiffres, espaces, tirets, points, parenthèses, « + » au début. */
const PHONE = /^\+?[\d\s().-]{6,30}$/;

/** Glycémie saisie ⇒ mg/dL entier, ou l'erreur à montrer ; `null` si le champ est vide. */
export function glucoseMgDl(text: string, unit: GlucoseUnit): number | null | DraftError {
  if (!text.trim()) return null;
  const value = parseDecimal(text);
  if (value === null || !Number.isFinite(value) || value <= 0) return 'glucoseInvalid';
  const mgDl = toMgDl(value, unit); // déjà arrondi à l'entier (ADR-0002)
  return mgDl < GLUCOSE_MIN || mgDl > GLUCOSE_MAX ? 'glucoseRange' : mgDl;
}

/** Vérifie le formulaire : les erreurs par champ, ou rien. */
export function validateDraft(draft: CardDraft, unit: GlucoseUnit): DraftErrors {
  const errors: DraftErrors = {};
  for (const [field, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    if (draft[field].trim().length > max) errors[field] = 'tooLong';
  }
  const glucose = glucoseMgDl(draft.glucose, unit);
  if (typeof glucose === 'string') errors.glucose = glucose;
  const phone = draft.emergencyContactPhone.trim();
  if (phone && !PHONE.test(phone) && !errors.emergencyContactPhone) {
    errors.emergencyContactPhone = 'phoneInvalid';
  }
  return errors;
}

/** Formulaire valide ⇒ corps de PUT /emergency (un champ vide est simplement absent). */
export function toInput(draft: CardDraft, unit: GlucoseUnit, enabled: boolean): EmergencyCardInput {
  const text = (value: string) => (value.trim() ? value.trim() : undefined);
  const glucose = glucoseMgDl(draft.glucose, unit);
  return {
    fullName: text(draft.fullName),
    diabetesType: text(draft.diabetesType),
    declaredTreatment: text(draft.declaredTreatment),
    allergies: text(draft.allergies),
    bloodGroup: draft.bloodGroup ?? undefined,
    lastKnownGlucoseMgDl: typeof glucose === 'number' ? glucose : undefined,
    emergencyContactName: text(draft.emergencyContactName),
    emergencyContactPhone: text(draft.emergencyContactPhone),
    enabled,
  };
}

/** Ce que le profil peut proposer (le patient décide de l'utiliser ou non). */
export interface ProfileFacts {
  firstName: string;
  lastName: string;
  diabetesType: DiabetesType;
  /** Contact d'urgence du profil (L1-08), s'il a été donné. */
  emergencyContact?: { name: string; phone: string; relation?: string | null } | null;
}

/**
 * Propositions tirées du profil, SEULEMENT pour les champs encore vides du formulaire (rien n'est écrasé).
 * `diabetesLabel` : le libellé traduit du type (« Type 2 »).
 */
export function profileSuggestions(
  draft: CardDraft,
  profile: ProfileFacts,
  diabetesLabel: (type: DiabetesType) => string,
): Partial<CardDraft> {
  const out: Partial<CardDraft> = {};
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  if (!draft.fullName.trim() && name) out.fullName = name;
  if (!draft.diabetesType.trim()) out.diabetesType = diabetesLabel(profile.diabetesType);
  const contact = profile.emergencyContact?.name.trim();
  if (!draft.emergencyContactName.trim() && contact) {
    const relation = profile.emergencyContact?.relation?.trim();
    out.emergencyContactName = relation ? `${contact} (${relation})` : contact;
  }
  const phone = profile.emergencyContact?.phone.trim();
  if (!draft.emergencyContactPhone.trim() && phone) out.emergencyContactPhone = phone;
  return out;
}

/** Proposition « utiliser ma dernière mesure » : le texte du champ et ce qu'on annonce au patient. */
export function lastMeasurementSuggestion(
  latest: { valueMgDl: number; measuredAt: string } | null,
  unit: GlucoseUnit,
): { glucose: string; label: string; measuredAt: string } | null {
  if (!latest) return null;
  const mgDl = Math.min(GLUCOSE_MAX, Math.max(GLUCOSE_MIN, Math.round(latest.valueMgDl)));
  return {
    glucose: glucoseInput(mgDl, unit),
    label: formatGlucose(mgDl, unit),
    measuredAt: latest.measuredAt,
  };
}

/** Une ligne de l'aperçu « ce que verra le secouriste ». */
export interface PreviewLine {
  field: EmergencyCardField;
  text: string;
}

/** Les champs renseignés, dans l'ordre de la page publique (même règle que le portail). */
export function previewLines(card: EmergencyCardResponse, unit: GlucoseUnit): PreviewLine[] {
  return EMERGENCY_CARD_FIELDS.flatMap((field) => {
    const value = card[field];
    if (value === undefined || value === '') return [];
    const text =
      field === 'lastKnownGlucoseMgDl' ? formatGlucose(value as number, unit) : String(value);
    return [{ field, text }];
  });
}

/** Le QR tel que le téléphone peut l'afficher. */
export type QrStatus =
  | { kind: 'none' } // jamais généré
  | { kind: 'ready'; token: string; url: string } // généré, jeton gardé sur ce téléphone
  | { kind: 'elsewhere' }; // généré, mais le jeton n'est pas sur ce téléphone

export function qrStatus(
  card: Pick<EmergencyCardResponse, 'qrActive'>,
  stored: { token: string; url: string } | null,
): QrStatus {
  if (!card.qrActive) return { kind: 'none' };
  return stored ? { kind: 'ready', token: stored.token, url: stored.url } : { kind: 'elsewhere' };
}

/**
 * Activer la carte alors qu'aucun QR n'est affichable sur ce téléphone ⇒ en générer un dans la foulée (choix
 * de l'équipe : le patient obtient tout de suite un QR qui marche). Désactiver n'en génère jamais.
 */
export function shouldGenerateQr(enabled: boolean, qr: QrStatus): boolean {
  return enabled && qr.kind !== 'ready';
}

/** Pourquoi une action a échoué (l'écran traduit chaque cas). */
export type CardProblem = 'offline' | 'noProfile' | 'tooMany' | 'invalid' | 'error';

export function cardProblem(error: unknown): CardProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 0) return 'offline';
  if (error.status === 404) return 'noProfile';
  if (error.status === 429) return 'tooMany';
  if (error.status === 400) return 'invalid';
  return 'error';
}
