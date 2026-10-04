import { coalesceOps, type QueuedOp } from '../coalesce';

const op = (seq: number, entityId: string, type: 'upsert' | 'delete'): QueuedOp => ({
  seq,
  opId: `op-${seq}`,
  entity: 'measurement',
  entityId,
  type,
});

describe('coalesceOps', () => {
  it('garde la dernière modification d\'une même entité', () => {
    const r = coalesceOps([op(1, 'A', 'upsert'), op(2, 'A', 'upsert'), op(3, 'A', 'upsert')]);
    expect(r.map((o) => o.opId)).toEqual(['op-3']);
  });

  it('modification puis suppression : seule la suppression reste', () => {
    const r = coalesceOps([op(1, 'A', 'upsert'), op(2, 'A', 'delete')]);
    expect(r).toHaveLength(1);
    expect(r[0]?.type).toBe('delete');
  });

  it('des entités différentes restent séparées et dans l\'ordre', () => {
    const r = coalesceOps([op(1, 'A', 'upsert'), op(2, 'B', 'upsert'), op(3, 'A', 'upsert')]);
    expect(r.map((o) => o.entityId)).toEqual(['B', 'A']);
  });

  it('ne modifie pas le tableau d\'entrée', () => {
    const input = [op(2, 'A', 'upsert'), op(1, 'A', 'upsert')];
    coalesceOps(input);
    expect(input.map((o) => o.seq)).toEqual([2, 1]);
  });
});
