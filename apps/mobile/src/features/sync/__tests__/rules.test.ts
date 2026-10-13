// Ticket L8-06 : règles pures du moteur de synchronisation (rules.ts).
import { syncOpSchema, type MeasurementDto } from '@glyka/shared';
import type { OutboxRow } from '@/db/repositories/outbox.repo';
import type { MeasurementRow } from '@/db/repositories/plans';
import {
  PUSH_BATCH,
  buildPushBatch,
  decideRemote,
  eventFromRemote,
  measurementFromRemote,
  planPull,
  retryDelay,
  settle,
} from '../rules';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const upsertRow = (seq: number, entityId: string, value = 110): OutboxRow => ({
  seq,
  op_id: uuid(1000 + seq),
  entity: 'measurement',
  type: 'upsert',
  entity_id: entityId,
  client_updated_at: `2026-10-10T08:00:0${seq % 10}.000Z`,
  payload: JSON.stringify({
    id: entityId,
    value,
    unit: 'MG_DL',
    measuredAt: '2026-10-09T07:00:00.000Z',
    context: 'FASTING',
    confirmedUnusual: false,
  }),
  attempts: 0,
});

const dto = (patch: Partial<MeasurementDto> = {}): MeasurementDto => ({
  id: uuid(1),
  valueMgDl: 187,
  originalValue: 1.87,
  originalUnit: 'G_L',
  measuredAt: '2026-10-09T07:00:00+00:00',
  context: 'FASTING',
  source: 'IMPORT',
  importBatchId: uuid(50),
  note: null,
  updatedAt: '2026-10-10T08:00:00.000Z',
  deletedAt: null,
  ...patch,
});

describe('retryDelay', () => {
  it('2 s, 4 s, 8 s… plafonné à 5 minutes', () => {
    expect([1, 2, 3, 4].map(retryDelay)).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(retryDelay(9)).toBe(300_000);
    expect(retryDelay(1_000)).toBe(300_000);
    expect(retryDelay(0)).toBe(2_000);
  });
});

describe('buildPushBatch', () => {
  it('coalesce la file et produit des opérations valides pour le serveur', () => {
    const rows = [upsertRow(1, uuid(1), 100), upsertRow(2, uuid(2)), upsertRow(3, uuid(1), 140)];
    const { ops, sent } = buildPushBatch(rows);
    expect(ops.map((op) => op.opId)).toEqual([uuid(1002), uuid(1003)]);
    expect(ops.every((op) => syncOpSchema.safeParse(op).success)).toBe(true);
    expect((ops[1]?.payload as { value: number }).value).toBe(140);
    expect(sent[1]).toEqual({ opId: uuid(1003), seq: 3, entity: 'measurement', entityId: uuid(1) });
  });

  it('une suppression part SANS payload', () => {
    const row: OutboxRow = { ...upsertRow(1, uuid(1)), type: 'delete', payload: null };
    const { ops } = buildPushBatch([row]);
    expect(ops[0]).not.toHaveProperty('payload');
    expect(syncOpSchema.safeParse(ops[0]).success).toBe(true);
  });

  it('jamais plus de 200 opérations par lot', () => {
    const rows = Array.from({ length: 250 }, (_, i) => upsertRow(i + 1, uuid(i + 1)));
    expect(buildPushBatch(rows).ops).toHaveLength(PUSH_BATCH);
  });
});

describe('settle', () => {
  const sent = [
    { opId: 'a', seq: 1, entity: 'measurement' as const, entityId: uuid(1) },
    { opId: 'b', seq: 2, entity: 'measurement' as const, entityId: uuid(2) },
    { opId: 'c', seq: 3, entity: 'event' as const, entityId: uuid(3) },
    { opId: 'd', seq: 4, entity: 'event' as const, entityId: uuid(4) },
    { opId: 'e', seq: 5, entity: 'event' as const, entityId: uuid(5) },
  ];

  it('APPLIED, DUPLICATE, CONFLICT ⇒ réglées ; REJECTED ⇒ gardée avec sa raison ; sans réponse ⇒ rien', () => {
    const outcome = settle(sent, [
      { opId: 'a', result: 'APPLIED' },
      { opId: 'b', result: 'DUPLICATE' },
      { opId: 'c', result: 'REJECTED', reason: 'Date dans le futur.' },
      { opId: 'd', result: 'CONFLICT_SERVER_WINS' },
    ]);
    expect(outcome.settlements.map((s) => [s.opId, s.outcome, s.reason])).toEqual([
      ['a', 'done', undefined],
      ['b', 'done', undefined],
      ['c', 'rejected', 'Date dans le futur.'],
      ['d', 'done', undefined],
    ]);
    expect(outcome.conflict).toBe(true);
    expect(outcome.unanswered).toBe(1);
  });

  it('sans conflit ⇒ le curseur reste ; refus sans raison ⇒ raison générique', () => {
    const outcome = settle(sent.slice(0, 1), [{ opId: 'a', result: 'REJECTED' }]);
    expect(outcome.conflict).toBe(false);
    expect(outcome.settlements[0]?.reason).toBe('Opération refusée.');
  });
});

describe('données reçues du serveur', () => {
  it('mesure importée ⇒ ligne locale complète, en UTC, plus « en attente »', () => {
    expect(measurementFromRemote(dto(), null)).toEqual({
      id: uuid(1),
      value_mgdl: 187,
      original_value: 1.87,
      original_unit: 'G_L',
      measured_at: '2026-10-09T07:00:00.000Z',
      context: 'FASTING',
      source: 'IMPORT',
      import_batch_id: uuid(50),
      note: null,
      confirmed_unusual: 0,
      client_updated_at: '2026-10-10T08:00:00.000Z',
      updated_at: '2026-10-10T08:00:00.000Z',
      deleted_at: null,
      pending_sync: 0,
    });
  });

  it('valeur hors 20–600 mg/dL ⇒ confirmée (le serveur ne l’accepte que confirmée)', () => {
    expect(measurementFromRemote(dto({ valueMgDl: 990 }), null).confirmed_unusual).toBe(1);
    expect(measurementFromRemote(dto({ valueMgDl: 19 }), null).confirmed_unusual).toBe(1);
    expect(measurementFromRemote(dto({ valueMgDl: 20 }), null).confirmed_unusual).toBe(0);
    expect(measurementFromRemote(dto({ valueMgDl: 600 }), null).confirmed_unusual).toBe(0);
  });

  it('la date de modification locale ne recule jamais', () => {
    const local = { client_updated_at: '2026-10-10T09:00:00.000Z' } as MeasurementRow;
    expect(measurementFromRemote(dto(), local).client_updated_at).toBe('2026-10-10T09:00:00.000Z');
    const older = { client_updated_at: '2026-10-10T07:00:00.000Z' } as MeasurementRow;
    expect(measurementFromRemote(dto(), older).client_updated_at).toBe('2026-10-10T08:00:00.000Z');
  });

  it('suppression reçue ⇒ pierre tombale', () => {
    const row = measurementFromRemote(dto({ deletedAt: '2026-10-10T08:05:00Z' }), null);
    expect(row.deleted_at).toBe('2026-10-10T08:05:00.000Z');
  });

  it('événement reçu ⇒ ligne locale', () => {
    expect(
      eventFromRemote(
        {
          id: uuid(9),
          type: 'ACTIVITY',
          occurredAt: '2026-10-09T18:00:00Z',
          label: 'Marche',
          details: null,
          durationMinutes: 30,
          updatedAt: '2026-10-10T08:00:00Z',
          deletedAt: null,
        },
        null,
      ),
    ).toEqual({
      id: uuid(9),
      type: 'ACTIVITY',
      occurred_at: '2026-10-09T18:00:00.000Z',
      label: 'Marche',
      details: null,
      duration_minutes: 30,
      client_updated_at: '2026-10-10T08:00:00.000Z',
      updated_at: '2026-10-10T08:00:00.000Z',
      deleted_at: null,
      pending_sync: 0,
    });
  });

  it('decideRemote : sans attente ⇒ enregistrer ; suppression ⇒ enregistrer et retirer ; sinon garder', () => {
    expect(decideRemote(false, false)).toBe('save');
    expect(decideRemote(true, false)).toBe('save');
    expect(decideRemote(true, true)).toBe('save-and-drop-pending');
    expect(decideRemote(false, true)).toBe('keep-local');
  });

  it('planPull applique ces décisions à une page entière', () => {
    const plan = planPull(
      {
        measurements: [
          dto({ id: uuid(1) }),
          dto({ id: uuid(2) }),
          dto({ id: uuid(3), deletedAt: '2026-10-10T08:00:00Z' }),
        ],
        events: [],
      },
      {
        measurements: new Map(),
        events: new Map(),
        pending: new Set([`measurement:${uuid(2)}`, `measurement:${uuid(3)}`, `event:${uuid(1)}`]),
      },
    );
    expect(plan.measurements.map((m) => m.id)).toEqual([uuid(1), uuid(3)]);
    expect(plan.dropPending).toEqual([{ entity: 'measurement', id: uuid(3) }]);
    expect(plan.kept).toBe(1);
  });
});
