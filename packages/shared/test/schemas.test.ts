import { describe, expect, it } from 'vitest';
import {
  askInsightSchema,
  deleteAccountSchema,
  importCommitSchema,
  importPreviewFormSchema,
  insightsQuerySchema,
  listQuerySchema,
  reportQuerySchema,
  syncOpSchema,
  syncPushRequestSchema,
  updateLifeEventSchema,
  updateMeasurementSchema,
} from '../src';

const ID_A = '3f2b8c1e-6a4d-4e1b-9c7a-1d2e3f4a5b6c';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const OP = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const NOW = '2026-10-07T08:30:00+01:00';

const measurement = (id = ID_A) => ({ id, value: 1.48, unit: 'G_L', measuredAt: NOW });
const lifeEvent = (id = ID_A) => ({ id, type: 'MEAL', occurredAt: NOW, label: 'Déjeuner' });
const op = (over: Record<string, unknown> = {}) => ({
  opId: OP,
  entity: 'measurement',
  type: 'upsert',
  entityId: ID_A,
  clientUpdatedAt: NOW,
  payload: measurement(),
  ...over,
});

describe('syncOpSchema : cohérence des opérations de synchronisation', () => {
  it('accepte un upsert de mesure et un upsert d’événement', () => {
    expect(syncOpSchema.safeParse(op()).success).toBe(true);
    const event = op({ entity: 'event', payload: lifeEvent() });
    expect(syncOpSchema.safeParse(event).success).toBe(true);
  });

  it('accepte une suppression sans payload, ou avec payload null', () => {
    const noPayload = op({ type: 'delete', payload: undefined });
    expect(syncOpSchema.safeParse(noPayload).success).toBe(true);
    expect(syncOpSchema.safeParse(op({ type: 'delete', payload: null })).success).toBe(true);
  });

  it('refuse un upsert sans payload', () => {
    expect(syncOpSchema.safeParse(op({ payload: undefined })).success).toBe(false);
  });

  it('refuse une suppression qui contient un payload', () => {
    expect(syncOpSchema.safeParse(op({ type: 'delete' })).success).toBe(false);
  });

  it('refuse un payload d’événement annoncé comme une mesure (et inversement)', () => {
    expect(syncOpSchema.safeParse(op({ payload: lifeEvent() })).success).toBe(false);
    expect(syncOpSchema.safeParse(op({ entity: 'event' })).success).toBe(false);
  });

  it('refuse un payload dont l’id diffère de entityId', () => {
    const result = syncOpSchema.safeParse(op({ payload: measurement(ID_B) }));
    expect(result.success).toBe(false);
  });

  it('limite un lot à 200 opérations', () => {
    const many = Array.from({ length: 201 }, () => op());
    expect(syncPushRequestSchema.safeParse({ deviceId: ID_B, ops: many }).success).toBe(false);
    expect(
      syncPushRequestSchema.safeParse({ deviceId: ID_B, ops: many.slice(0, 200) }).success,
    ).toBe(true);
  });
});

describe('importCommitSchema', () => {
  it('exige correctedValue pour une correction', () => {
    const bad = importCommitSchema.safeParse({ decisions: [{ line: 42, action: 'CORRECT' }] });
    expect(bad.success).toBe(false);
    const good = importCommitSchema.safeParse({
      decisions: [{ line: 42, action: 'CORRECT', correctedValue: 1.87, correctedUnit: 'G_L' }],
    });
    expect(good.success).toBe(true);
  });

  it('refuse deux décisions sur la même ligne', () => {
    const twice = importCommitSchema.safeParse({
      decisions: [
        { line: 5, action: 'IGNORE' },
        { line: 5, action: 'ACCEPT' },
      ],
    });
    expect(twice.success).toBe(false);
  });

  it('accepte une liste vide ou absente (tout est accepté tel quel)', () => {
    const empty = importCommitSchema.parse({});
    expect(empty.decisions).toEqual([]);
  });
});

describe('importPreviewFormSchema : envoi multipart', () => {
  it('décode le mapping reçu sous forme de JSON texte', () => {
    const parsed = importPreviewFormSchema.parse({
      defaultUnit: 'G_L',
      mapping: '{"date":"date","time":"heure","value":"glycemie"}',
    });
    expect(parsed.mapping).toEqual({ date: 'date', time: 'heure', value: 'glycemie' });
  });

  it('accepte l’absence de mapping (détection automatique)', () => {
    expect(importPreviewFormSchema.parse({ defaultUnit: 'MG_DL' }).mapping).toBeUndefined();
    expect(
      importPreviewFormSchema.parse({ defaultUnit: 'MG_DL', mapping: '' }).mapping,
    ).toBeUndefined();
  });

  it('refuse un mapping qui n’est pas du JSON, ou qui n’a pas la bonne forme', () => {
    expect(importPreviewFormSchema.safeParse({ defaultUnit: 'G_L', mapping: 'abc' }).success).toBe(
      false,
    );
    expect(
      importPreviewFormSchema.safeParse({ defaultUnit: 'G_L', mapping: '{"colonne":"x"}' }).success,
    ).toBe(false);
  });
});

describe('updateLifeEventSchema', () => {
  it('accepte une modification partielle, sans identifiant', () => {
    expect(updateLifeEventSchema.safeParse({ label: 'Dîner' }).success).toBe(true);
    expect(updateLifeEventSchema.safeParse({}).success).toBe(true);
  });

  it('valide toujours les champs fournis', () => {
    expect(updateLifeEventSchema.safeParse({ durationMinutes: 0 }).success).toBe(false);
    expect(updateLifeEventSchema.safeParse({ type: 'SOMMEIL' }).success).toBe(false);
  });
});

describe('analyse : périodes et question libre', () => {
  it('applique 30 jours par défaut et refuse une période inconnue', () => {
    expect(insightsQuerySchema.parse({}).period).toBe(30);
    expect(insightsQuerySchema.parse({ period: '7' }).period).toBe(7);
    expect(insightsQuerySchema.safeParse({ period: '45' }).success).toBe(false);
  });

  it('le rapport n’accepte que 14, 30 ou 90 jours', () => {
    expect(reportQuerySchema.safeParse({ period: '14' }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ period: '7' }).success).toBe(false);
  });

  it('refuse une question vide ou trop longue', () => {
    expect(askInsightSchema.safeParse({ question: '  ' }).success).toBe(false);
    expect(askInsightSchema.safeParse({ question: 'x'.repeat(501) }).success).toBe(false);
    expect(askInsightSchema.parse({ question: 'Pourquoi autant de variations ?' }).period).toBe(30);
  });
});

describe('listQuerySchema', () => {
  it('applique limit=500 par défaut et plafonne à 2000', () => {
    expect(listQuerySchema.parse({}).limit).toBe(500);
    expect(listQuerySchema.safeParse({ limit: '2001' }).success).toBe(false);
  });

  it('refuse une période inversée', () => {
    const inverted = listQuerySchema.safeParse({
      from: '2026-10-07T00:00:00Z',
      to: '2026-10-01T00:00:00Z',
    });
    expect(inverted.success).toBe(false);
  });
});

describe('deleteAccountSchema', () => {
  it('exige le mot de passe', () => {
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: 'x' }).success).toBe(true);
  });
});

describe('updateMeasurementSchema', () => {
  it('refuse une valeur sans unité, ou une unité sans valeur', () => {
    expect(updateMeasurementSchema.safeParse({ value: 1.5 }).success).toBe(false);
    expect(updateMeasurementSchema.safeParse({ unit: 'G_L' }).success).toBe(false);
  });

  it('accepte une valeur avec son unité, ou un autre champ seul', () => {
    expect(updateMeasurementSchema.safeParse({ value: 1.5, unit: 'G_L' }).success).toBe(true);
    expect(updateMeasurementSchema.safeParse({ context: 'FASTING' }).success).toBe(true);
    expect(updateMeasurementSchema.safeParse({}).success).toBe(true);
  });
});
