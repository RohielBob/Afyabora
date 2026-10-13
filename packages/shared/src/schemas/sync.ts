// Protocole de synchronisation hors-ligne (ADR-0004).
// Le mobile écrit d'abord en local (SQLite) et empile des opérations dans une « outbox ».
// POST /sync/push envoie les opérations ; GET /sync/pull?cursor=… récupère les changements serveur.
import { z } from 'zod';
import { SYNC_ENTITIES, SYNC_OP_TYPES } from '../enums';
import { createMeasurementSchema } from './measurement';
import { createLifeEventSchema } from './event';

export const syncOpSchema = z
  .object({
    /** Identifiant unique de l'opération : le serveur la traite une seule fois (idempotence). */
    opId: z.string().uuid(),
    entity: z.enum(SYNC_ENTITIES),
    type: z.enum(SYNC_OP_TYPES),
    entityId: z.string().uuid(),
    /** Horloge de l'appareil au moment de la modification (règle : dernière écriture gagne). */
    clientUpdatedAt: z.string().datetime({ offset: true }),
    /** Obligatoire pour un upsert ; absent (ou null) pour un delete. */
    payload: z.union([createMeasurementSchema, createLifeEventSchema]).nullish(),
  })
  .superRefine((op, ctx) => {
    const fail = (message: string, path: string[] = ['payload']) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if (op.type === 'delete') {
      if (op.payload != null) fail('Une suppression ne contient pas de payload');
      return;
    }
    if (op.payload == null) return fail('Un upsert exige un payload');

    // Le payload doit correspondre à l'entité annoncée, et à l'identifiant de l'opération.
    const schema = op.entity === 'measurement' ? createMeasurementSchema : createLifeEventSchema;
    const parsed = schema.safeParse(op.payload);
    if (!parsed.success) return fail(`payload invalide pour l'entité « ${op.entity} »`);
    if (parsed.data.id !== op.entityId) fail('payload.id doit être égal à entityId', ['entityId']);
  });
export type SyncOp = z.infer<typeof syncOpSchema>;

export const syncPushRequestSchema = z.object({
  deviceId: z.string().uuid(),
  ops: z.array(syncOpSchema).max(200),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const SYNC_OP_RESULTS = [
  'APPLIED',
  'DUPLICATE',
  'REJECTED',
  'CONFLICT_SERVER_WINS',
] as const;
export interface SyncOpResult {
  opId: string;
  result: (typeof SYNC_OP_RESULTS)[number];
  reason?: string;
}
export interface SyncPushResponse {
  results: SyncOpResult[];
  serverTime: string;
}

export const syncPullQuerySchema = z.object({
  /** Curseur renvoyé par le serveur ; absent = première synchronisation */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/**
 * Enveloppe de POST /sync/push validée par la route (ADR-0004, modification 1) : `deviceId` et 200
 * opérations au plus. Chaque opération est ensuite validée SÉPARÉMENT avec `syncOpSchema` : une opération
 * invalide est REJECTED avec sa raison, sans faire échouer tout le lot (400).
 */
export const syncPushEnvelopeSchema = z.object({
  deviceId: z.string().uuid(),
  ops: z.array(z.unknown()).max(200),
});
export type SyncPushEnvelope = z.infer<typeof syncPushEnvelopeSchema>;

/** Réponse de POST /sync/push (vérifiable par le mobile, L8-06). */
export const syncPushResponseSchema = z.object({
  results: z.array(
    z.object({
      opId: z.string(),
      result: z.enum(SYNC_OP_RESULTS),
      reason: z.string().optional(),
    }),
  ),
  serverTime: z.string().datetime({ offset: true }),
});
