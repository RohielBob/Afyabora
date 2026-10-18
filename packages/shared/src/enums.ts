// Énumérations partagées par l'API, le mobile et le portail.
// Source de vérité unique : ne pas redéfinir ces valeurs ailleurs.

export const USER_ROLES = ['PATIENT', 'DOCTOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DIABETES_TYPES = ['TYPE_1', 'TYPE_2', 'GESTATIONAL', 'OTHER'] as const;
export type DiabetesType = (typeof DIABETES_TYPES)[number];

export const GLUCOSE_UNITS = ['G_L', 'MG_DL', 'MMOL_L'] as const;
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number];

export const MEASUREMENT_CONTEXTS = [
  'FASTING',
  'BEFORE_MEAL',
  'AFTER_MEAL',
  'BEDTIME',
  'NIGHT',
  'OTHER',
] as const;
export type MeasurementContext = (typeof MEASUREMENT_CONTEXTS)[number];

export const MEASUREMENT_SOURCES = ['MANUAL', 'IMPORT', 'DEVICE'] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const LIFE_EVENT_TYPES = ['MEAL', 'ACTIVITY', 'TREATMENT'] as const;
export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number];

/** Catégories qu'un patient peut cocher avant de générer un QR de partage. */
export const SHARE_CATEGORIES = [
  'GLUCOSE_HISTORY',
  'TREATMENTS',
  'MEALS',
  'ACTIVITY',
  'AI_SUMMARY',
  'PERSONAL_NOTES',
  'REPORT_DOWNLOAD',
] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

export const SHARE_DURATIONS = ['MIN_5', 'MIN_30', 'HOUR_1', 'CONSULTATION'] as const;
export type ShareDuration = (typeof SHARE_DURATIONS)[number];

export const SHARE_STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

/** Actions du journal d'accès du patient (contrat : AccessAction). */
export const ACCESS_ACTIONS = [
  'SHARE_CLAIMED',
  'SHARE_VIEWED',
  'SHARE_REVOKED',
  'SHARE_EXPIRED',
  'EMERGENCY_VIEWED',
  'REPORT_DOWNLOADED',
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const DOCTOR_VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type DoctorVerificationStatus = (typeof DOCTOR_VERIFICATION_STATUSES)[number];

export const GLUCOSE_STATES = ['VERY_LOW', 'LOW', 'IN_RANGE', 'HIGH', 'VERY_HIGH'] as const;
export type GlucoseState = (typeof GLUCOSE_STATES)[number];

export const QUALITY_LEVELS = ['GOOD', 'PARTIAL', 'INSUFFICIENT'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const INSIGHT_TYPES = [
  'TREND',
  'TIME_OF_DAY_PATTERN',
  'ANOMALY',
  'HIGH_STREAK',
  'REPEATED_HYPO',
  'MISSING_DATA',
  'PERIOD_COMPARISON',
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_SEVERITIES = ['INFO', 'ATTENTION', 'ALERT'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

/** Nature d'une ligne de la chronologie médicale (contrat : TimelineKind, dossier partagé L5-12). */
export const TIMELINE_KINDS = ['MEASUREMENT', 'MEAL', 'ACTIVITY', 'TREATMENT', 'ALERT'] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const NOTIFICATION_CATEGORIES = [
  'MEASUREMENT_REMINDER',
  'GLUCOSE_ALERT',
  'DATA_GAP',
  'SHARE_ACTIVITY',
  'EMERGENCY_ACCESS',
  'IMPORT_DONE',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const SYNC_ENTITIES = ['measurement', 'event'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OP_TYPES = ['upsert', 'delete'] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

// Assistant de conversation « Afyabora » (lot L9, contrat 0.4.0, ADR-0005 complétée le 2026-10-11).

/** Auteur d'un message : le patient, ou l'assistant. */
export const ASSISTANT_MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

/** PENDING : réponse en préparation (le modèle de langage travaille) ; READY : réponse définitive. */
export const ASSISTANT_MESSAGE_STATUSES = ['PENDING', 'READY'] as const;
export type AssistantMessageStatus = (typeof ASSISTANT_MESSAGE_STATUSES)[number];

/**
 * Nature d'une réponse de l'assistant :
 * - MEASUREMENTS : sur les mesures du patient (chiffres calculés par @glyka/analytics) ;
 * - SHEET : question générale, réponse tirée d'une fiche (citée) ;
 * - REFUSAL : dose, diagnostic, traitement, prédiction… ⇒ refus poli et renvoi au professionnel de santé ;
 * - EMERGENCY : urgence ⇒ message d'urgence (numéro, médecin, proche), sans passer par le modèle ;
 * - OUT_OF_SCOPE : hors sujet ou aucune fiche ne répond ⇒ « je ne peux pas répondre », jamais d'invention.
 */
export const ASSISTANT_ANSWER_KINDS = [
  'MEASUREMENTS',
  'SHEET',
  'REFUSAL',
  'EMERGENCY',
  'OUT_OF_SCOPE',
] as const;
export type AssistantAnswerKind = (typeof ASSISTANT_ANSWER_KINDS)[number];

/** Fiche de connaissances : DRAFT (pas encore relue par le médecin) ou VALIDATED (relue). */
export const KNOWLEDGE_SHEET_STATUSES = ['DRAFT', 'VALIDATED'] as const;
export type KnowledgeSheetStatus = (typeof KNOWLEDGE_SHEET_STATUSES)[number];
