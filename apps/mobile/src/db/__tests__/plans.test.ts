// Ticket L8-03 : plans d'écriture locale (ligne + opération d'outbox), sans base de données.
import { syncOpSchema } from '@glyka/shared';
import {
  InvalidLocalWrite,
  eventPayload,
  measurementPayload,
  planEventCreate,
  planEventDelete,
  planEventUpdate,
  planMeasurementCreate,
  planMeasurementDelete,
  planMeasurementUpdate,
} from '../repositories/plans';

const ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ctx = (n: number) => ({
  opId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
  now: `2026-10-10T08:0${n}:00.000Z`,
});

const created = () =>
  planMeasurementCreate(
    {
      id: ID,
      value: 1.48,
      unit: 'G_L',
      measuredAt: '2026-10-10T09:30:00+01:00', // heure de Kinshasa
      context: 'FASTING',
      note: '  après une marche ',
      confirmedUnusual: false,
    },
    ctx(1),
  );

describe('mesures', () => {
  it('création : ligne (mg/dL + valeur d’origine, date en UTC) et opération upsert complète', () => {
    const { row, op } = created();
    expect(row).toMatchObject({
      id: ID,
      value_mgdl: 148,
      original_value: 1.48,
      original_unit: 'G_L',
      measured_at: '2026-10-10T08:30:00.000Z',
      source: 'MANUAL',
      note: 'après une marche',
      confirmed_unusual: 0,
      pending_sync: 1,
      deleted_at: null,
    });
    expect(op).toMatchObject({ entity: 'measurement', type: 'upsert', entityId: ID });
    expect(syncOpSchema.safeParse(op).success).toBe(true);
    expect(op.payload).toEqual(measurementPayload(row));
  });

  it('provenance : import avec son lot', () => {
    const { row } = planMeasurementCreate(
      {
        id: ID,
        value: 120,
        unit: 'MG_DL',
        measuredAt: '2026-10-09T07:00:00Z',
        context: 'OTHER',
        confirmedUnusual: false,
      },
      ctx(1),
      { source: 'IMPORT', importBatchId: EVENT_ID },
    );
    expect(row).toMatchObject({ source: 'IMPORT', import_batch_id: EVENT_ID });
  });

  it('création invalide : rien n’est planifié (erreur claire)', () => {
    expect(() =>
      planMeasurementCreate(
        {
          id: 'pas-un-uuid',
          value: -1,
          unit: 'G_L',
          measuredAt: 'hier',
          context: 'FASTING',
          confirmedUnusual: false,
        },
        ctx(1),
      ),
    ).toThrow(InvalidLocalWrite);
  });

  it('modifier la note seulement : le payload reste COMPLET, la confirmation est gardée', () => {
    const unusual = planMeasurementCreate(
      {
        id: ID,
        value: 18.7,
        unit: 'G_L',
        measuredAt: '2026-10-10T08:00:00Z',
        context: 'FASTING',
        confirmedUnusual: true,
      },
      ctx(1),
    ).row;
    const { row, op } = planMeasurementUpdate(unusual, { note: 'lecteur vérifié' }, ctx(2));
    expect(row).toMatchObject({ value_mgdl: 1870, note: 'lecteur vérifié', confirmed_unusual: 1 });
    expect(op.payload).toMatchObject({
      id: ID,
      value: 18.7,
      unit: 'G_L',
      measuredAt: '2026-10-10T08:00:00.000Z',
      context: 'FASTING',
      note: 'lecteur vérifié',
      confirmedUnusual: true,
    });
    expect(op.clientUpdatedAt).toBe(ctx(2).now);
    expect(syncOpSchema.safeParse(op).success).toBe(true);
  });

  it('changer la valeur annule la confirmation, sauf si elle est redonnée', () => {
    const base = { ...created().row, confirmed_unusual: 1 as const };
    expect(planMeasurementUpdate(base, { value: 140, unit: 'MG_DL' }, ctx(2)).row).toMatchObject({
      value_mgdl: 140,
      original_unit: 'MG_DL',
      confirmed_unusual: 0,
    });
    expect(
      planMeasurementUpdate(base, { value: 700, unit: 'MG_DL', confirmedUnusual: true }, ctx(2)).row
        .confirmed_unusual,
    ).toBe(1);
  });

  it('note vidée = note effacée ; valeur sans unité refusée ; mesure supprimée non modifiable', () => {
    const base = created().row;
    expect(planMeasurementUpdate(base, { note: '   ' }, ctx(2)).row.note).toBeNull();
    expect(() => planMeasurementUpdate(base, { value: 2 }, ctx(2))).toThrow(InvalidLocalWrite);
    const deleted = planMeasurementDelete(base, ctx(2)).row;
    expect(() => planMeasurementUpdate(deleted, { note: 'x' }, ctx(3))).toThrow(InvalidLocalWrite);
  });

  it('suppression : pierre tombale, note effacée, opération delete SANS payload', () => {
    const { row, op } = planMeasurementDelete(created().row, ctx(2));
    expect(row).toMatchObject({ deleted_at: ctx(2).now, note: null, pending_sync: 1 });
    expect(op).toMatchObject({ entity: 'measurement', type: 'delete', entityId: ID });
    expect(op.payload).toBeUndefined();
    expect(syncOpSchema.safeParse(op).success).toBe(true);
  });
});

describe('événements', () => {
  const meal = () =>
    planEventCreate(
      {
        id: EVENT_ID,
        type: 'MEAL',
        occurredAt: '2026-10-10T12:30:00+01:00',
        label: 'Déjeuner',
        details: ' fufu, pondu ',
      },
      ctx(1),
    );

  it('création : ligne et opération upsert complète, valide pour le serveur', () => {
    const { row, op } = meal();
    expect(row).toMatchObject({
      id: EVENT_ID,
      type: 'MEAL',
      occurred_at: '2026-10-10T11:30:00.000Z',
      label: 'Déjeuner',
      details: 'fufu, pondu',
      duration_minutes: null,
      pending_sync: 1,
    });
    expect(op).toMatchObject({ entity: 'event', type: 'upsert', entityId: EVENT_ID });
    expect(op.payload).toEqual(eventPayload(row));
    expect(syncOpSchema.safeParse(op).success).toBe(true);
  });

  it('libellé vide ou durée impossible : refusé', () => {
    expect(() =>
      planEventCreate(
        { id: EVENT_ID, type: 'MEAL', occurredAt: '2026-10-10T11:30:00Z', label: '  ' },
        ctx(1),
      ),
    ).toThrow(InvalidLocalWrite);
    expect(() =>
      planEventCreate(
        {
          id: EVENT_ID,
          type: 'ACTIVITY',
          occurredAt: '2026-10-10T11:30:00Z',
          label: 'Marche',
          durationMinutes: 2000,
        },
        ctx(1),
      ),
    ).toThrow(InvalidLocalWrite);
  });

  it('modification : champs donnés seulement, payload complet', () => {
    const { row, op } = planEventUpdate(meal().row, { durationMinutes: 30 }, ctx(2));
    expect(row).toMatchObject({ label: 'Déjeuner', details: 'fufu, pondu', duration_minutes: 30 });
    expect(op.payload).toMatchObject({
      id: EVENT_ID,
      type: 'MEAL',
      label: 'Déjeuner',
      details: 'fufu, pondu',
      durationMinutes: 30,
    });
  });

  it('suppression : détails (texte libre) effacés, opération delete', () => {
    const { row, op } = planEventDelete(meal().row, ctx(2));
    expect(row).toMatchObject({ details: null, deleted_at: ctx(2).now });
    expect(op).toMatchObject({ entity: 'event', type: 'delete' });
    expect(op.payload).toBeUndefined();
  });
});
