import { z } from 'zod';
import { GLUCOSE_UNITS, MEASUREMENT_CONTEXTS, MEASUREMENT_SOURCES } from '../enums';

/** L'identifiant est généré par le CLIENT (UUID v4) : indispensable à la synchronisation hors-ligne. */
export const createMeasurementSchema = z.object({
  id: z.string().uuid(),
  value: z.number().positive(),
  unit: z.enum(GLUCOSE_UNITS),
  measuredAt: z.string().datetime({ offset: true }),
  context: z.enum(MEASUREMENT_CONTEXTS).default('OTHER'),
  note: z.string().max(500).optional(),
  /** Si true, le patient a confirmé une valeur hors des bornes plausibles. */
  confirmedUnusual: z.boolean().default(false),
});
export type CreateMeasurementInput = z.infer<typeof createMeasurementSchema>;

/** PUT /measurements/:id : l'identifiant est dans l'URL. Une valeur n'a de sens qu'avec son unité. */
export const updateMeasurementSchema = createMeasurementSchema
  .omit({ id: true })
  .partial()
  .refine((update) => (update.value === undefined) === (update.unit === undefined), {
    message: 'value et unit doivent être fournis ensemble',
    path: ['unit'],
  });
export type UpdateMeasurementInput = z.infer<typeof updateMeasurementSchema>;

export const measurementDtoSchema = z.object({
  id: z.string().uuid(),
  valueMgDl: z.number().int(),
  originalValue: z.number(),
  originalUnit: z.enum(GLUCOSE_UNITS),
  measuredAt: z.string().datetime({ offset: true }),
  context: z.enum(MEASUREMENT_CONTEXTS),
  source: z.enum(MEASUREMENT_SOURCES),
  importBatchId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type MeasurementDto = z.infer<typeof measurementDtoSchema>;

export const periodQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
