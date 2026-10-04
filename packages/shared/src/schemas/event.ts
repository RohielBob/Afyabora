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
