// Base EN MÉMOIRE de l'aperçu web (développement dans le navigateur, où SQLite n'est pas utilisé : voir
// docs/team/pieges-connus.md). Mêmes tables que la base du téléphone (mesures, événements, file d'envoi,
// clé/valeur), le temps de la session du navigateur. Utilisée par les versions web des dépôts
// (features/*/local-store.web.ts) et du moteur de synchronisation (features/sync/store.web.ts) : l'aperçu
// web envoie et reçoit donc les données comme un téléphone. Jamais utilisée sur téléphone.
import type { SyncOp } from '@glyka/shared';
import type { OutboxRow } from './repositories/outbox.repo';
import type { EventRow, MeasurementRow } from './repositories/plans';

/** Opération de la file d'envoi, avec sa raison si le serveur l'a refusée (colonne `last_error`). */
export type MemoryOutboxRow = OutboxRow & { last_error: string | null };

export interface WebMemory {
  measurements: Map<string, MeasurementRow>;
  events: Map<string, EventRow>;
  outbox: MemoryOutboxRow[];
  kv: Map<string, string>;
  /** Prochain numéro d'ordre de la file (comme AUTOINCREMENT). */
  nextSeq: number;
}

export function createWebMemory(): WebMemory {
  return { measurements: new Map(), events: new Map(), outbox: [], kv: new Map(), nextSeq: 1 };
}

/** La base de l'aperçu web (une par onglet du navigateur). */
export const webMemory: WebMemory = createWebMemory();

/** Ajoute une opération à la file d'envoi (comme outbox.repo.ts `enqueue`). */
export function enqueueInMemory(memory: WebMemory, op: SyncOp): void {
  memory.outbox.push({
    seq: memory.nextSeq++,
    op_id: op.opId,
    entity: op.entity,
    type: op.type,
    entity_id: op.entityId,
    client_updated_at: op.clientUpdatedAt,
    payload: op.payload ? JSON.stringify(op.payload) : null,
    attempts: 0,
    last_error: null,
  });
}

/** Vide tout (déconnexion) : le compte suivant ne voit jamais les données du précédent. */
export function clearWebMemory(memory: WebMemory = webMemory): void {
  memory.measurements.clear();
  memory.events.clear();
  memory.outbox.length = 0;
  memory.kv.clear();
}
