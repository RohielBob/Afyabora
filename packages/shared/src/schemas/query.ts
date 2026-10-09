import { z } from 'zod';

/** Paramètres de liste (GET /measurements, GET /events) : période, taille de page, curseur. */
export const listQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(2000).default(500),
    /** Curseur opaque renvoyé par la page précédente. */
    cursor: z.string().max(500).optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
    message: '« from » doit précéder « to »',
    path: ['from'],
  });
export type ListQuery = z.infer<typeof listQuerySchema>;
