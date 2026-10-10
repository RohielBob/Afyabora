// Ticket L8-03 : dépôts locaux (mesures, événements) avec écriture atomique dans l'outbox.
// SQLite ne tourne pas dans Jest : on remplace la base par une base SIMULÉE qui se comporte comme SQLite
// sur ce qui compte ici :
//  - une écriture hors transaction est REFUSÉE (elle révélerait une écriture non atomique) ;
//  - si une instruction échoue dans une transaction, TOUT est annulé (retour à l'état d'avant).
import { syncOpSchema } from '@glyka/shared';

type Row = Record<string, unknown>;

/** Opération telle qu'écrite dans l'outbox (payload en JSON). */
interface OutboxEntry {
  opId: string;
  entity: string;
  type: string;
  entityId: string;
  clientUpdatedAt: string;
  payload: string | null;
}

class FakeDb {
  tables: Record<'measurements' | 'events', Map<string, Row>> = {
    measurements: new Map(),
    events: new Map(),
  };
  outbox: OutboxEntry[] = [];
  inTransaction = false;
  /** Simule une panne pendant l'écriture de l'opération (disque plein…). */
  failOutbox = false;

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    const snapshot = {
      measurements: new Map(this.tables.measurements),
      events: new Map(this.tables.events),
      outbox: [...this.outbox],
    };
    this.inTransaction = true;
    try {
      await task();
    } catch (error) {
      this.tables = { measurements: snapshot.measurements, events: snapshot.events };
      this.outbox = snapshot.outbox;
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<void> {
    if (!this.inTransaction) throw new Error(`Écriture hors transaction : ${sql}`);
    const upsert = sql.match(/^INSERT OR REPLACE INTO (measurements|events) \(([^)]+)\) VALUES/);
    if (upsert) {
      const columns = (upsert[2] as string).split(', ');
      const row = Object.fromEntries(columns.map((c, i) => [c, params[i]]));
      this.tables[upsert[1] as 'measurements' | 'events'].set(row.id as string, row);
      return;
    }
    if (sql.trim().startsWith('INSERT INTO outbox')) {
      if (this.failOutbox) throw new Error('disque plein');
      const [opId, entity, type, entityId, clientUpdatedAt, payload] = params;
      this.outbox.push({ opId, entity, type, entityId, clientUpdatedAt, payload } as OutboxEntry);
      return;
    }
    throw new Error(`Requête inattendue : ${sql}`);
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const match = sql.match(/FROM (measurements|events) WHERE id = \?/);
    if (!match) throw new Error(`Lecture inattendue : ${sql}`);
    const row = this.tables[match[1] as 'measurements' | 'events'].get(params[0] as string);
    if (!row || (sql.includes('deleted_at IS NULL') && row.deleted_at)) return null;
    return { ...row } as T;
  }

  async getAllAsync<T>(): Promise<T[]> {
    return [];
  }

  /** Opérations telles que le moteur de synchronisation les lira (payload décodé). */
  ops() {
    return this.outbox.map((o) => ({
      ...o,
      payload: o.payload ? (JSON.parse(o.payload) as Row) : null,
    }));
  }
}

// Préfixe « mock » : exigé par Jest pour les variables utilisées dans jest.mock().
let mockDb: FakeDb;
let mockCounter = 0;

jest.mock('../client', () => ({ getDb: async () => mockDb }));
jest.mock('@/lib/uuid', () => ({
  newId: () => `00000000-0000-4000-8000-${String(++mockCounter).padStart(12, '0')}`,
}));

// Importés APRÈS les remplacements ci-dessus.
import { createEvent, deleteEvent, updateEvent } from '../repositories/events.repo';
import {
  createMeasurement,
  deleteMeasurement,
  updateMeasurement,
} from '../repositories/measurements.repo';
import { LocalNotFound } from '../repositories/write';

beforeEach(() => {
  mockDb = new FakeDb();
  mockCounter = 0;
});

const measurementInput = {
  value: 18.7,
  unit: 'G_L' as const,
  measuredAt: '2026-10-10T08:00:00.000Z',
  context: 'FASTING' as const,
  confirmedUnusual: true,
};

describe('mesures', () => {
  it('création : la mesure ET son opération, dans la même transaction', async () => {
    const id = await createMeasurement(measurementInput);
    expect(mockDb.tables.measurements.get(id)).toMatchObject({ value_mgdl: 1870, pending_sync: 1 });
    const [op] = mockDb.ops();
    expect(op).toMatchObject({ entity: 'measurement', type: 'upsert', entityId: id });
    expect(syncOpSchema.safeParse({ ...op, payload: op?.payload ?? undefined }).success).toBe(true);
  });

  it('panne pendant l’écriture de l’opération : la mesure n’est PAS gardée (tout est annulé)', async () => {
    mockDb.failOutbox = true;
    await expect(createMeasurement(measurementInput)).rejects.toThrow('disque plein');
    expect(mockDb.tables.measurements.size).toBe(0);
    expect(mockDb.outbox).toHaveLength(0);
  });

  it('modification : relit la mesure, renvoie l’objet complet (confirmation gardée)', async () => {
    const id = await createMeasurement(measurementInput);
    await updateMeasurement(id, { note: 'lecteur vérifié' });
    const ops = mockDb.ops();
    expect(ops).toHaveLength(2);
    expect(ops[1]?.payload).toMatchObject({
      id,
      value: 18.7,
      unit: 'G_L',
      note: 'lecteur vérifié',
      confirmedUnusual: true,
    });
  });

  it('modifier une mesure absente ou supprimée : erreur claire, rien n’est écrit', async () => {
    await expect(updateMeasurement('inconnue', { note: 'x' })).rejects.toThrow(LocalNotFound);
    const id = await createMeasurement(measurementInput);
    await deleteMeasurement(id);
    await expect(updateMeasurement(id, { note: 'x' })).rejects.toThrow(LocalNotFound);
    expect(mockDb.ops().map((o) => o.type)).toEqual(['upsert', 'delete']);
  });

  it('suppression : pierre tombale + opération delete ; supprimer deux fois ne refait rien', async () => {
    const id = await createMeasurement({ ...measurementInput, note: 'à effacer' });
    await deleteMeasurement(id);
    await deleteMeasurement(id);
    expect(mockDb.tables.measurements.get(id)).toMatchObject({ note: null });
    expect(mockDb.tables.measurements.get(id)?.deleted_at).toBeTruthy();
    expect(mockDb.ops().map((o) => o.type)).toEqual(['upsert', 'delete']);
    expect(mockDb.ops()[1]?.payload).toBeNull();
  });
});

describe('événements', () => {
  const meal = {
    type: 'MEAL' as const,
    occurredAt: '2026-10-10T11:30:00.000Z',
    label: 'Déjeuner',
    details: 'fufu, pondu',
  };

  it('création, modification et suppression : chaque écriture a son opération', async () => {
    const id = await createEvent(meal);
    await updateEvent(id, { label: 'Déjeuner tardif' });
    await deleteEvent(id);
    const ops = mockDb.ops();
    expect(ops.map((o) => [o.entity, o.type])).toEqual([
      ['event', 'upsert'],
      ['event', 'upsert'],
      ['event', 'delete'],
    ]);
    expect(ops[1]?.payload).toMatchObject({ label: 'Déjeuner tardif', details: 'fufu, pondu' });
    expect(mockDb.tables.events.get(id)).toMatchObject({ details: null });
  });

  it('événement invalide : refusé avant toute écriture', async () => {
    await expect(createEvent({ ...meal, label: '' })).rejects.toThrow();
    expect(mockDb.tables.events.size).toBe(0);
    expect(mockDb.outbox).toHaveLength(0);
  });

  it('panne pendant l’écriture de l’opération : la modification est annulée', async () => {
    const id = await createEvent(meal);
    mockDb.failOutbox = true;
    await expect(updateEvent(id, { label: 'Autre' })).rejects.toThrow('disque plein');
    expect(mockDb.tables.events.get(id)).toMatchObject({ label: 'Déjeuner' });
    expect(mockDb.outbox).toHaveLength(1);
  });

  it('supprimer un événement absent : rien à faire, pas d’opération', async () => {
    await deleteEvent('inconnu');
    expect(mockDb.outbox).toHaveLength(0);
  });
});
