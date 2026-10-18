import { z } from 'zod';
import {
  ACCESS_ACTIONS,
  DIABETES_TYPES,
  GLUCOSE_STATES,
  GLUCOSE_UNITS,
  MEASUREMENT_SOURCES,
  QUALITY_LEVELS,
  SHARE_CATEGORIES,
  SHARE_DURATIONS,
  SHARE_STATUSES,
  TIMELINE_KINDS,
} from '../enums';
import { insightSchema, qualityScoreSchema, rangeStatsSchema } from './insights';

export const createShareSchema = z.object({
  categories: z
    .array(z.enum(SHARE_CATEGORIES))
    .min(1, 'Choisissez au moins une catégorie')
    .refine((c) => new Set(c).size === c.length, 'Catégories en double'),
  duration: z.enum(SHARE_DURATIONS),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const claimShareSchema = z.object({ token: z.string().min(20).max(200) });

export interface ShareTokenDto {
  token: string; // contenu du QR (jamais de données médicales)
  expiresAt: string; // rotation toutes les SHARE_TOKEN_TTL_SECONDS
}

// ---------- Réponses (contrat : ShareToken, DoctorIdentity, ShareSession, CreateShareResponse) ----------
// Vérifiables par l'application du patient (L5-06) ; la forme est celle du contrat gelé.

const isoDate = z.string().datetime({ offset: true });

export const shareTokenSchema = z.object({
  /** Contenu du QR : jeton opaque (≥ 32 octets), jamais de donnée médicale. */
  token: z.string().min(43),
  /** Fin de validité du jeton (rotation toutes les 60 s, usage unique). */
  expiresAt: isoDate,
});

export const doctorIdentitySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  institution: z.string(),
});
export type DoctorIdentity = z.infer<typeof doctorIdentitySchema>;

export const shareSessionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(SHARE_STATUSES),
  categories: z.array(z.enum(SHARE_CATEGORIES)),
  duration: z.enum(SHARE_DURATIONS),
  createdAt: isoDate,
  /** Fixées au scan par le médecin (L5-03) : nulles tant que la session attend. */
  claimedAt: isoDate.nullable(),
  expiresAt: isoDate.nullable(),
  revokedAt: isoDate.nullable(),
  doctor: doctorIdentitySchema.nullable(),
});
export type ShareSessionDto = z.infer<typeof shareSessionSchema>;

/** Réponse de POST /shares (L5-01) : la session (en attente de scan) et son premier jeton. */
export const createShareResponseSchema = z.object({
  session: shareSessionSchema,
  token: shareTokenSchema,
});
export type CreateShareResponse = z.infer<typeof createShareResponseSchema>;

// ---------- Scan par le médecin (contrat : ClaimShareResponse, PatientPublicIdentity) ----------

/** Ce que le médecin apprend du patient en scannant : le prénom et le type de diabète, rien de plus. */
export const patientPublicIdentitySchema = z.object({
  firstName: z.string(),
  diabetesType: z.enum(DIABETES_TYPES),
});
export type PatientPublicIdentity = z.infer<typeof patientPublicIdentitySchema>;

/** Réponse de POST /shares/claim (L5-03) : l'accès est ouvert jusqu'à `expiresAt`. */
export const claimShareResponseSchema = z.object({
  sessionId: z.string().uuid(),
  /** Fin de l'accès : heure du scan + durée choisie par le patient. */
  expiresAt: isoDate,
  /** Seules ces catégories seront visibles par le médecin. */
  categories: z.array(z.enum(SHARE_CATEGORIES)),
  patient: patientPublicIdentitySchema,
});
export type ClaimShareResponse = z.infer<typeof claimShareResponseSchema>;

// ---------- Suivi d'une session par le patient (contrat : ShareStatusResponse) ----------

/** Réponse de GET /shares/:id/status (L5-04). Le serveur est la seule horloge de référence. */
export const shareStatusResponseSchema = z.object({
  status: z.enum(SHARE_STATUSES),
  /** Fin de l'accès (fixée au scan) ; nulle tant que la session attend. */
  expiresAt: isoDate.nullable(),
  claimedAt: isoDate.nullable(),
  /** Le médecin qui a scanné ; nul tant que la session attend. */
  doctor: doctorIdentitySchema.nullable(),
  /** Secondes d'accès restantes, calculées par le serveur ; nulles si l'accès n'est pas ouvert. */
  remainingSeconds: z.number().int().min(0).nullable(),
});
export type ShareStatusResponse = z.infer<typeof shareStatusResponseSchema>;

// ---------- Journal d'accès du patient (contrat : AccessLogEntry, AccessLogList) ----------

/** Paramètres de GET /shares/log (L5-05) : taille de page et curseur, comme les autres listes. */
export const accessLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  /** Curseur opaque renvoyé par la page précédente (`nextCursor`). */
  cursor: z.string().max(500).optional(),
});
export type AccessLogQuery = z.infer<typeof accessLogQuerySchema>;

/** Une ligne du journal : qui, quoi, quand. Jamais de donnée médicale, jamais l'adresse IP. */
export const accessLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(ACCESS_ACTIONS),
  at: isoDate,
  sessionId: z.string().uuid().nullable(),
  /** Nom du médecin ; nul pour un accès d'urgence anonyme (ou un compte médecin supprimé). */
  actorName: z.string().nullable(),
});
export type AccessLogEntry = z.infer<typeof accessLogEntrySchema>;

/** Réponse de GET /shares/log (L5-05) : du plus récent au plus ancien. */
export const accessLogListSchema = z.object({
  items: z.array(accessLogEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AccessLogList = z.infer<typeof accessLogListSchema>;

// ---------- Patients partagés du médecin (contrat : DoctorSession, DoctorSessionList) ----------

/** Une session de partage vue par le médecin (L5-11) : patient, état, catégories, dernière donnée, qualité. */
export const doctorSessionSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(SHARE_STATUSES),
  /** Heure du scan. */
  claimedAt: isoDate,
  /** Fin de l'accès (heure du serveur). */
  expiresAt: isoDate.nullable(),
  categories: z.array(z.enum(SHARE_CATEGORIES)),
  patient: patientPublicIdentitySchema,
  /** Dernière mesure : seulement pendant l'accès et si l'historique glycémique est partagé ; sinon null. */
  lastMeasurementAt: isoDate.nullable(),
  /** Qualité des données (30 derniers jours) : mêmes conditions ; sinon null. */
  quality: z
    .object({ score: z.number().int().min(0).max(100), level: z.enum(QUALITY_LEVELS) })
    .nullable(),
});
export type DoctorSessionDto = z.infer<typeof doctorSessionSchema>;

/** Réponse de GET /doctor/sessions (L5-11) : accès en cours d'abord, puis du plus récent au plus ancien. */
export const doctorSessionListSchema = z.object({ items: z.array(doctorSessionSchema) });
export type DoctorSessionList = z.infer<typeof doctorSessionListSchema>;

// ---------- Dossier partagé, lu par le médecin (contrat : DoctorSummary, TimelineList ; L5-12) ----------

/** Seuils du patient, tels que renvoyés (mg/dL entiers). */
const thresholdsDtoSchema = z.object({
  veryLowMgDl: z.number().int(),
  targetMinMgDl: z.number().int(),
  targetMaxMgDl: z.number().int(),
  veryHighMgDl: z.number().int(),
});

/** Réponse de GET /doctor/sessions/:id/summary : session, identité limitée, qualité, statistiques, analyse. */
export const doctorSummarySchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    status: z.enum(SHARE_STATUSES),
    /** Fin de l'accès (heure du serveur). */
    expiresAt: isoDate.nullable(),
    categories: z.array(z.enum(SHARE_CATEGORIES)),
  }),
  /** Prénom, type, année du diagnostic, unité préférée et seuils : jamais le nom ni la date de naissance. */
  patient: z.object({
    firstName: z.string(),
    diabetesType: z.enum(DIABETES_TYPES),
    diagnosisYear: z.number().int().nullable(),
    preferredUnit: z.enum(GLUCOSE_UNITS),
    thresholds: thresholdsDtoSchema,
  }),
  /** 30 derniers jours. Sans glycémies ni résumé partagés : calculée sur zéro mesure (rien n'est révélé). */
  quality: qualityScoreSchema,
  /** 30 derniers jours ; null sous 10 mesures ou si les glycémies et le résumé ne sont pas partagés. */
  stats: rangeStatsSchema.nullable(),
  /** Présent seulement si le résumé des analyses (AI_SUMMARY) est partagé. */
  insights: z.array(insightSchema).optional(),
});
export type DoctorSummary = z.infer<typeof doctorSummarySchema>;

/** Une ligne de la chronologie : mesure (valeur, état, provenance) ou évènement déclaré (libellé). */
export const timelineItemSchema = z.object({
  kind: z.enum(TIMELINE_KINDS),
  at: isoDate,
  /** Évènement : texte saisi par le patient. Mesure : contexte (FASTING, AFTER_MEAL…), traduit par l'écran. */
  label: z.string(),
  valueMgDl: z.number().int().nullable(),
  state: z.enum(GLUCOSE_STATES).nullable(),
  source: z.enum(MEASUREMENT_SOURCES).nullable(),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;

/** Réponse de GET /doctor/sessions/:id/timeline : du plus récent au plus ancien, par curseur. */
export const timelineListSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
});
export type TimelineList = z.infer<typeof timelineListSchema>;
