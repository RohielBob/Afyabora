import { z } from 'zod';
import { SHARE_CATEGORIES, SHARE_DURATIONS, SHARE_STATUSES } from '../enums';

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
