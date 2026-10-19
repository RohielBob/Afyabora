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

// ---------- Réponses (contrat 0.4.2 : EmergencyCardResponse, EmergencyQrResponse, EmergencyCardPublic) ----------

const isoDate = z.string().datetime({ offset: true });

/** GET /emergency, PUT /emergency : la carte telle qu'enregistrée, et si un QR a été généré. */
export const emergencyCardResponseSchema = emergencyCardSchema.extend({
  updatedAt: isoDate,
  /** Vrai si un QR d'urgence a été généré (le jeton lui-même n'est montré qu'à la génération). */
  qrActive: z.boolean(),
});
export type EmergencyCardResponse = z.infer<typeof emergencyCardResponseSchema>;

/** POST /emergency/regenerate : le jeton (montré UNE fois) et l'adresse à mettre dans le QR. */
export const emergencyQrResponseSchema = z.object({
  token: z.string(),
  url: z.string().url(),
});
export type EmergencyQrResponse = z.infer<typeof emergencyQrResponseSchema>;

/**
 * GET /e/:token (page publique) : UNIQUEMENT les champs renseignés par le patient, et la date de mise à jour.
 * Jamais d'historique, jamais l'état « activé », jamais d'identifiant.
 */
export const emergencyCardPublicSchema = emergencyCardSchema
  .omit({ enabled: true })
  .extend({ updatedAt: isoDate })
  .strict();
export type EmergencyCardPublic = z.infer<typeof emergencyCardPublicSchema>;

/** Champs que la carte peut montrer, dans l'ordre d'affichage. */
export const EMERGENCY_CARD_FIELDS = [
  'fullName',
  'diabetesType',
  'declaredTreatment',
  'allergies',
  'bloodGroup',
  'lastKnownGlucoseMgDl',
  'emergencyContactName',
  'emergencyContactPhone',
] as const;
export type EmergencyCardField = (typeof EMERGENCY_CARD_FIELDS)[number];
