// Coalescence de l'outbox (ticket L8-08) : fonction PURE, sans dépendance, testable seule.
// Règle : pour une même entité, seule la DERNIÈRE opération en attente compte
// (plusieurs modifications → une seule ; modification puis suppression → la suppression).
// On ne coalesce JAMAIS une opération déjà envoyée mais pas encore confirmée.

export interface QueuedOp {
  seq: number;
  opId: string;
  entity: string;
  entityId: string;
  type: 'upsert' | 'delete';
}

export function coalesceOps<T extends QueuedOp>(ops: T[]): T[] {
  const lastByEntity = new Map<string, T>();
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    lastByEntity.set(`${op.entity}:${op.entityId}`, op);
  }
  return [...lastByEntity.values()].sort((a, b) => a.seq - b.seq);
}
