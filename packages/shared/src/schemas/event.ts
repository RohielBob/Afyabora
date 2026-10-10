import { z } from 'zod';
import { LIFE_EVENT_TYPES } from '../enums';

export const createLifeEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(LIFE_EVENT_TYPES),
  occurredAt: z.string().datetime({ offset: true }),
  label: z.string().trim().min(1).max(120),
  /** Texte libre. Traitements : *déclaré par le patient*, jamais de calcul de dose. */
  details: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
});
export type CreateLifeEventInput = z.infer<typeof createLifeEventSchema>;

/** PUT /events/:id : l'identifiant est dans l'URL, tous les champs sont optionnels. */
export const updateLifeEventSchema = createLifeEventSchema.omit({ id: true }).partial();
export type UpdateLifeEventInput = z.infer<typeof updateLifeEventSchema>;

/** Événement renvoyé par l'API (contrat : LifeEvent). Dates en UTC ; `deletedAt` non nul = supprimé. */
export const lifeEventDtoSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(LIFE_EVENT_TYPES),
  occurredAt: z.string().datetime({ offset: true }),
  label: z.string(),
  details: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type LifeEventDto = z.infer<typeof lifeEventDtoSchema>;
