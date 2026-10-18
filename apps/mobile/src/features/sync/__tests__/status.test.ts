// Ticket L8-10 : ce que l'interface affiche de la synchronisation (status.ts) et des refus (rejected.ts).
import type { EventRow, MeasurementRow } from '@/db/repositories/plans';
import { INITIAL_SYNC_STATE, type SyncState } from '../engine';
import { describeRejected, type RejectedChange } from '../rejected';
import {
  lastSyncPhrase,
  nextRetryPhrase,
  pendingPhrase,
  syncStatusView,
  type Translate,
} from '../status';

/** Traduction simulée : « clé{paramètres} », assez pour vérifier les choix sans dépendre des textes. */
const t: Translate = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

const state = (patch: Partial<SyncState>): SyncState => ({ ...INITIAL_SYNC_STATE, ...patch });
const pending = (measurements: number, events = 0) => ({
  pendingMeasurements: measurements,
  pendingEvents: events,
  pendingCount: measurements + events,
});

describe('syncStatusView', () => {
  it('rien en attente : « Tout est à jour », avec la dernière synchronisation', () => {
    const view = syncStatusView(state({ lastSuccessAt: '2026-10-18T08:00:00.000Z' }));
    expect(view).toMatchObject({
      tone: 'ok',
      title: 'upToDate',
      lastSuccessAt: '2026-10-18T08:00:00.000Z',
      canRetry: false,
      rejected: 0,
    });
  });

  it('en attente : le titre est le nombre de données, sans « Réessayer »', () => {
    const view = syncStatusView(state(pending(2)));
    expect(view).toMatchObject({ tone: 'pending', title: 'pending', canRetry: false });
    expect(view.pending).toEqual({ measurements: 2, events: 0, total: 2 });
    expect(view.lastSuccessAt).toBeNull();
  });

  it('hors ligne (CDC F11) : « Hors ligne… », compteur gardé, pas de « Réessayer »', () => {
    const view = syncStatusView(
      state({
        status: 'offline',
        lastError: 'offline',
        nextRetryAt: '2026-10-18T08:05:00.000Z',
        ...pending(2),
      }),
    );
    expect(view).toMatchObject({
      tone: 'offline',
      title: 'offline',
      canRetry: false,
      nextRetryAt: null,
    });
    expect(view.pending.total).toBe(2);
  });

  it('serveur en panne ou base en erreur : problème, prochain essai et « Réessayer »', () => {
    for (const lastError of ['server', 'local', 'refused'] as const) {
      const view = syncStatusView(
        state({ status: 'error', lastError, nextRetryAt: '2026-10-18T08:00:04.000Z' }),
      );
      expect(view).toMatchObject({
        tone: 'problem',
        title: 'problem',
        canRetry: true,
        nextRetryAt: '2026-10-18T08:00:04.000Z',
      });
    }
  });

  it('session expirée : il faut se reconnecter, « Réessayer » ne servirait à rien', () => {
    const view = syncStatusView(state({ status: 'error', lastError: 'session' }));
    expect(view).toMatchObject({ tone: 'problem', title: 'session', canRetry: false });
  });

  it('pendant un cycle : « Synchronisation en cours… »', () => {
    expect(syncStatusView(state({ status: 'syncing', ...pending(1) }))).toMatchObject({
      tone: 'syncing',
      title: 'syncing',
    });
  });

  it('tout est envoyé SAUF des refus : pas « Tout est à jour », mais « à vérifier » (attention)', () => {
    const view = syncStatusView(
      state({ failedCount: 1, lastSuccessAt: '2026-10-18T08:00:00.000Z' }),
    );
    expect(view).toMatchObject({
      tone: 'problem',
      title: 'rejected',
      rejected: 1,
      canRetry: false,
    });
    expect(view.lastSuccessAt).toBe('2026-10-18T08:00:00.000Z');
    // Des données attendent encore : on parle d'abord de l'attente.
    expect(syncStatusView(state({ failedCount: 1, ...pending(1) })).title).toBe('pending');
  });

  it('modifications refusées : signalées dans TOUS les états', () => {
    for (const status of ['idle', 'syncing', 'offline', 'error'] as const) {
      expect(syncStatusView(state({ status, failedCount: 2 })).rejected).toBe(2);
    }
  });
});

describe('pendingPhrase', () => {
  it('mesures seules, événements seuls, ou les deux ; rien ⇒ null', () => {
    expect(pendingPhrase(t, { measurements: 2, events: 0 })).toBe(
      'sync.pendingLine{"what":"sync.measurements{\\"count\\":2}"}',
    );
    expect(pendingPhrase(t, { measurements: 0, events: 1 })).toBe(
      'sync.pendingLine{"what":"sync.events{\\"count\\":1}"}',
    );
    expect(pendingPhrase(t, { measurements: 2, events: 1 })).toContain('sync.pendingBoth');
    expect(pendingPhrase(t, { measurements: 0, events: 0 })).toBeNull();
  });
});

describe('lastSyncPhrase', () => {
  const now = new Date('2026-10-18T15:00:00');
  it('aujourd’hui : l’heure seulement ; un autre jour : la date et l’heure ; jamais : « pas encore »', () => {
    expect(lastSyncPhrase(t, new Date('2026-10-18T14:30:00').toISOString(), now, 'fr-FR')).toBe(
      'sync.lastToday{"time":"14:30"}',
    );
    expect(lastSyncPhrase(t, new Date('2026-10-12T09:10:00').toISOString(), now, 'fr-FR')).toBe(
      'sync.lastOn{"date":"12 octobre","time":"09:10"}',
    );
    expect(lastSyncPhrase(t, null, now, 'fr-FR')).toBe('sync.never');
  });

  it('valeur seule (écran Synchronisation) : « Aujourd’hui à… », « Le … à … », « Jamais… »', () => {
    expect(
      lastSyncPhrase(t, new Date('2026-10-18T14:30:00').toISOString(), now, 'fr-FR', 'value'),
    ).toBe('sync.screen.lastToday{"time":"14:30"}');
    expect(
      lastSyncPhrase(t, new Date('2026-10-12T09:10:00').toISOString(), now, 'fr-FR', 'value'),
    ).toBe('sync.screen.lastOn{"date":"12 octobre","time":"09:10"}');
    expect(lastSyncPhrase(t, null, now, 'fr-FR', 'value')).toBe('sync.screen.lastNever');
  });
});

describe('describeRejected', () => {
  const base: Omit<RejectedChange, 'entity' | 'measurement' | 'event'> = {
    opId: 'op',
    entityId: 'id',
    type: 'upsert',
    reason: 'Valeur inhabituelle : vérifiez la saisie.',
    attempts: 2,
  };

  it('mesure enregistrée ou supprimée : valeur, date, contexte, raison et nombre de refus', () => {
    const measurement = {
      value_mgdl: 700,
      measured_at: '2026-10-17T07:00:00.000Z',
      context: 'FASTING',
    } as MeasurementRow;
    expect(describeRejected({ ...base, entity: 'measurement', measurement, event: null })).toEqual({
      kind: 'measurement',
      action: 'save',
      valueMgDl: 700,
      at: '2026-10-17T07:00:00.000Z',
      context: 'FASTING',
      reason: base.reason,
      attempts: 2,
    });
    expect(
      describeRejected({ ...base, type: 'delete', entity: 'measurement', measurement, event: null })
        .action,
    ).toBe('delete');
  });

  it('événement : type et libellé ; donnée plus sur le téléphone : champs vides', () => {
    const event = {
      type: 'MEAL',
      label: 'Déjeuner',
      occurred_at: '2026-10-17T12:00:00.000Z',
    } as EventRow;
    expect(describeRejected({ ...base, entity: 'event', measurement: null, event })).toMatchObject({
      kind: 'event',
      eventType: 'MEAL',
      label: 'Déjeuner',
      at: '2026-10-17T12:00:00.000Z',
    });
    expect(
      describeRejected({ ...base, entity: 'event', measurement: null, event: null }),
    ).toMatchObject({
      kind: 'event',
      eventType: null,
      label: null,
      at: null,
    });
    expect(
      describeRejected({ ...base, entity: 'measurement', measurement: null, event: null }),
    ).toMatchObject({ valueMgDl: null, at: null });
  });
});

describe('nextRetryPhrase', () => {
  const now = new Date('2026-10-18T15:00:00');
  it('dans moins d’une minute : « dans quelques secondes » ; sinon l’heure', () => {
    expect(nextRetryPhrase(t, new Date(now.getTime() + 4_000).toISOString(), now, 'fr-FR')).toBe(
      'sync.nextRetrySoon',
    );
    expect(nextRetryPhrase(t, new Date(now.getTime() + 59_999).toISOString(), now, 'fr-FR')).toBe(
      'sync.nextRetrySoon',
    );
    expect(nextRetryPhrase(t, new Date('2026-10-18T15:05:00').toISOString(), now, 'fr-FR')).toBe(
      'sync.nextRetry{"time":"15:05"}',
    );
  });
});
