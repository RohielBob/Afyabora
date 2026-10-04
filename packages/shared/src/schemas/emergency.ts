import { z } from 'zod';

/** Le patient choisit lui-même chaque champ. Un champ vide n'est jamais affiché. */
export const emergencyCardSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  diabetesType: z.string().trim().max(40).optional(),
  declaredTreatment: z.string().trim().max(200).optional(),
  allergies: z.string().trim().max(200).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  lastKnownGlucoseMgDl: z.number().int().min(20).max(600).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  enabled: z.boolean().default(false),
});
export type EmergencyCardInput = z.infer<typeof emergencyCardSchema>;
