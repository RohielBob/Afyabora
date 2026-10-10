import { z } from 'zod';
import { DIABETES_TYPES, GLUCOSE_UNITS } from '../enums';

const mgDl = z.number().int().min(20).max(600);

// Ordre obligatoire : très bas < début de plage cible < fin de plage cible < très haut.
// Chaque erreur pointe le champ fautif (« path ») pour que l'écran puisse l'afficher au bon endroit.
export const thresholdsSchema = z
  .object({
    veryLowMgDl: mgDl,
    targetMinMgDl: mgDl,
    targetMaxMgDl: mgDl,
    veryHighMgDl: mgDl,
  })
  .refine((t) => t.veryLowMgDl < t.targetMinMgDl, {
    message: 'Le seuil « très bas » doit être inférieur au début de la plage cible',
    path: ['veryLowMgDl'],
  })
  .refine((t) => t.targetMinMgDl < t.targetMaxMgDl, {
    message: 'Le début de la plage cible doit être inférieur à sa fin',
    path: ['targetMaxMgDl'],
  })
  .refine((t) => t.targetMaxMgDl < t.veryHighMgDl, {
    message: 'Le seuil « très haut » doit être supérieur à la fin de la plage cible',
    path: ['veryHighMgDl'],
  });

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  relation: z.string().trim().max(60).optional(),
});

/** Médecin qui suit le patient (facultatif, ajouté en L1-08 : changement de contrat 0.2.0). */
export const doctorContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
});

export const patientProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    birthDate: z.string().date(),
    sex: z.enum(['F', 'M', 'OTHER']),
    diabetesType: z.enum(DIABETES_TYPES),
    // Pas de « .max(new Date().getFullYear()) » ici : cette année serait calculée UNE fois, au chargement
    // du module (un serveur lancé en décembre refuserait l'année suivante). Vérifié dans superRefine.
    diagnosisYear: z.number().int().min(1950).optional(),
    preferredUnit: z.enum(GLUCOSE_UNITS).default('G_L'),
    thresholds: thresholdsSchema,
    /** true une fois les seuils relus avec un professionnel de santé */
    thresholdsReviewedByClinician: z.boolean().default(false),
    emergencyContact: emergencyContactSchema.optional(),
    doctorContact: doctorContactSchema.optional(),
  })
  // Règles qui dépendent de la date du jour ou de plusieurs champs : évaluées à CHAQUE validation.
  .superRefine((profile, ctx) => {
    const today = new Date();
    const birth = new Date(`${profile.birthDate}T00:00:00Z`);
    if (birth > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La date de naissance ne peut pas être dans le futur',
        path: ['birthDate'],
      });
    } else if (birth.getUTCFullYear() < 1900) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date de naissance invalide',
        path: ['birthDate'],
      });
    }
    if (profile.diagnosisYear !== undefined) {
      if (profile.diagnosisYear > today.getUTCFullYear()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "L'année du diagnostic ne peut pas être dans le futur",
          path: ['diagnosisYear'],
        });
      } else if (profile.diagnosisYear < birth.getUTCFullYear()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "L'année du diagnostic ne peut pas précéder la naissance",
          path: ['diagnosisYear'],
        });
      }
    }
  });
export type PatientProfileInput = z.infer<typeof patientProfileSchema>;
