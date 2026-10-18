import { z } from 'zod';
import { DIABETES_TYPES, SHARE_CATEGORIES, SHARE_DURATIONS, SHARE_STATUSES } from '../enums';

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
