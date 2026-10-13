// Serveur de synchronisation SIMULÉ pour les tests du moteur (L8-06) : mêmes règles que l'API (L8-04,
// L8-05), en mémoire.
//  - push : idempotence par opId (DUPLICATE), « la dernière écriture gagne » sur clientUpdatedAt
//    (CONFLICT_SERVER_WINS), suppression définitive, opération mal formée ⇒ REJECTED sans bloquer les autres ;
//  - pull : changements dans l'ordre d'écriture, par pages, curseur opaque, suppressions comprises.
// Le réseau peut être coupé (`offline`) ou le serveur en panne (`failNext`).
import {
  syncOpSchema,
  toMgDl,
  type CreateLifeEventInput,
  type CreateMeasurementInput,
  type LifeEventDto,
  type MeasurementDto,
  type SyncOp,
  type SyncOpResult,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@glyka/shared';
import type { SyncApi } from '../engine';

interface Stored {
  entity: 'measurement' | 'event';
  id: string;
  clientUpdatedAt: string;
  /** Ordre d'écriture sur le serveur (sert de curseur). */
  version: number;
  deletedAt: string | null;
  measurement?: MeasurementDto;
  event?: LifeEventDto;
}

/** Erreur comme celles de lib/api-client.ts (statut 0 = réseau). */
export class FakeApiError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

export class FakeServer {
  rows = new Map<string, Stored>();
  opLog = new Set<string>();
  version = 0;
  /** Horloge du serveur (ms), avance de 1 s à chaque écriture. */
  clock = Date.parse('2026-10-10T08:00:00.000Z');
  /** Taille des pages renvoyées (petite pour tester la pagination). */
  pageSize = 1_000;
  offline = false;
  /** Prochaines réponses en erreur HTTP (ex. [503, 503]). */
  failNext: number[] = [];
  /** Opérations à refuser (opId ⇒ raison), comme une valeur hors bornes non confirmée. */
  refuse = new Map<string, string>();
  /** Le prochain pull avec un curseur répond 400 (curseur abîmé). */
  rejectCursorOnce = false;
  pushes: SyncOp[][] = [];
  pulls: (string | null)[] = [];
  /** Appelé au milieu d'un push (avant la réponse) : simule une saisie pendant l'envoi. */
  duringPush: (() => Promise<void>) | null = null;

  private tick(): string {
    this.clock += 1_000;
    return iso(this.clock);
  }

  private guard(): void {
    if (this.offline) throw new FakeApiError(0);
    const status = this.failNext.shift();
    if (status !== undefined) throw new FakeApiError(status);
  }

  /** Écriture faite AILLEURS (portail, import, autre téléphone). */
  writeMeasurement(
    input: CreateMeasurementInput,
    clientUpdatedAt?: string,
    extra: Partial<MeasurementDto> = {},
  ): void {
    const updatedAt = this.tick();
    this.rows.set(input.id, {
      entity: 'measurement',
      id: input.id,
      clientUpdatedAt: clientUpdatedAt ?? updatedAt,
      version: ++this.version,
      deletedAt: null,
      measurement: {
        id: input.id,
        valueMgDl: toMgDl(input.value, input.unit),
        originalValue: input.value,
        originalUnit: input.unit,
        measuredAt: input.measuredAt,
        context: input.context ?? 'OTHER',
        source: 'MANUAL',
        importBatchId: null,
        note: input.note ?? null,
        updatedAt,
        deletedAt: null,
        ...extra,
      },
    });
  }

  writeEvent(input: CreateLifeEventInput, clientUpdatedAt?: string): void {
    const updatedAt = this.tick();
    this.rows.set(input.id, {
      entity: 'event',
      id: input.id,
      clientUpdatedAt: clientUpdatedAt ?? updatedAt,
      version: ++this.version,
      deletedAt: null,
      event: {
        id: input.id,
        type: input.type,
        occurredAt: input.occurredAt,
        label: input.label,
        details: input.details ?? null,
        durationMinutes: input.durationMinutes ?? null,
        updatedAt,
        deletedAt: null,
      },
    });
  }

  /** Suppression faite AILLEURS (annulation d'un import, autre téléphone). */
  remove(id: string): void {
    const row = this.rows.get(id);
    if (!row || row.deletedAt) return;
    const at = this.tick();
    row.deletedAt = at;
    row.version = ++this.version;
    if (row.measurement)
      row.measurement = { ...row.measurement, note: null, deletedAt: at, updatedAt: at };
    if (row.event) row.event = { ...row.event, details: null, deletedAt: at, updatedAt: at };
  }

  measurement(id: string): MeasurementDto | undefined {
    return this.rows.get(id)?.measurement;
  }

  private applyOp(op: SyncOp): SyncOpResult['result'] {
    const row = this.rows.get(op.entityId);
    if (op.type === 'delete') {
      if (!row || row.deletedAt) return 'APPLIED';
      if (row.clientUpdatedAt > op.clientUpdatedAt) return 'CONFLICT_SERVER_WINS';
      this.remove(op.entityId);
      (this.rows.get(op.entityId) as Stored).clientUpdatedAt = op.clientUpdatedAt;
      return 'APPLIED';
    }
    if (row && (row.deletedAt || row.clientUpdatedAt > op.clientUpdatedAt)) {
      return 'CONFLICT_SERVER_WINS';
    }
    if (op.entity === 'measurement') {
      this.writeMeasurement(op.payload as CreateMeasurementInput, op.clientUpdatedAt);
    } else {
      this.writeEvent(op.payload as CreateLifeEventInput, op.clientUpdatedAt);
    }
    return 'APPLIED';
  }

  api: SyncApi = {
    push: async ({ ops }): Promise<SyncPushResponse> => {
      this.guard();
      this.pushes.push(ops);
      if (this.duringPush) {
        const task = this.duringPush;
        this.duringPush = null;
        await task();
      }
      const results: SyncOpResult[] = ops.map((op) => {
        if (!syncOpSchema.safeParse(op).success) {
          return { opId: op.opId, result: 'REJECTED', reason: 'payload : invalide' };
        }
        const refusal = this.refuse.get(op.opId);
        if (refusal) return { opId: op.opId, result: 'REJECTED', reason: refusal };
        if (this.opLog.has(op.opId)) return { opId: op.opId, result: 'DUPLICATE' };
        const result = this.applyOp(op);
        this.opLog.add(op.opId);
        return { opId: op.opId, result };
      });
      return { results, serverTime: iso(this.clock) };
    },

    pull: async (cursor): Promise<SyncPullResponse> => {
      this.guard();
      this.pulls.push(cursor);
      if (cursor && this.rejectCursorOnce) {
        this.rejectCursorOnce = false;
        throw new FakeApiError(400);
      }
      const after = cursor ? Number(cursor.replace('v', '')) : 0;
      const changed = [...this.rows.values()]
        .filter((row) => row.version > after)
        .sort((a, b) => a.version - b.version);
      const page = changed.slice(0, this.pageSize);
      const last = page.at(-1);
      return {
        measurements: page.flatMap((row) => (row.measurement ? [row.measurement] : [])),
        events: page.flatMap((row) => (row.event ? [row.event] : [])),
        nextCursor: last ? `v${last.version}` : cursor,
        hasMore: changed.length > page.length,
        serverTime: iso(this.clock),
      };
    },
  };
}
