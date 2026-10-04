import { z } from 'zod';
import { DIABETES_TYPES, GLUCOSE_UNITS } from '../enums';

const mgDl = z.number().int().min(20).max(600);

export const thresholdsSchema = z
  .object({
    veryLowMgDl: mgDl,
    targetMinMgDl: mgDl,
    targetMaxMgDl: mgDl,
    veryHighMgDl: mgDl,
  })
  .refine((t) => t.veryLowMgDl < t.targetMinMgDl, { message: 'Seuil très bas < début de plage' })
  .refine((t) => t.targetMinMgDl < t.targetMaxMgDl, { message: 'Plage cible invalide' })
  .refine((t) => t.targetMaxMgDl < t.veryHighMgDl, { message: 'Seuil très haut > fin de plage' });

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  relation: z.string().trim().max(60).optional(),
});

export const patientProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.string().date(),
  sex: z.enum(['F', 'M', 'OTHER']),
  diabetesType: z.enum(DIABETES_TYPES),
  diagnosisYear: z.number().int().min(1950).max(new Date().getFullYear()).optional(),
  preferredUnit: z.enum(GLUCOSE_UNITS).default('G_L'),
  thresholds: thresholdsSchema,
  /** true une fois les seuils relus avec un professionnel de santé */
  thresholdsReviewedByClinician: z.boolean().default(false),
  emergencyContact: emergencyContactSchema.optional(),
});
export type PatientProfileInput = z.infer<typeof patientProfileSchema>;
