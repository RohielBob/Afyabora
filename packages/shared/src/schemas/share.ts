import { z } from 'zod';
import { SHARE_CATEGORIES, SHARE_DURATIONS } from '../enums';

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
