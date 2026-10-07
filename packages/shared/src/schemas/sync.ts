// Protocole de synchronisation hors-ligne (ADR-0004).
// Le mobile écrit d'abord en local (SQLite) et empile des opérations dans une « outbox ».
// POST /sync/push envoie les opérations ; GET /sync/pull?cursor=… récupère les changements serveur.
import { z } from 'zod';
import { SYNC_ENTITIES, SYNC_OP_TYPES } from '../enums';
import { createMeasurementSchema } from './measurement';
import { createLifeEventSchema } from './event';

export const syncOpSchema = z.object({
  /** Identifiant unique de l'opération : le serveur la traite une seule fois (idempotence). */
  opId: z.string().uuid(),
  entity: z.enum(SYNC_ENTITIES),
  type: z.enum(SYNC_OP_TYPES),
  entityId: z.string().uuid(),
  /** Horloge de l'appareil au moment de la modification (règle : dernière écriture gagne). */
  clientUpdatedAt: z.string().datetime({ offset: true }),
  /** Absent pour un delete */
  payload: z.union([createMeasurementSchema, createLifeEventSchema]).optional(),
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
