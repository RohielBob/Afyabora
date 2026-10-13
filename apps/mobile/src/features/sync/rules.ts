// Règles du moteur de synchronisation (L8-06, ADR-0004) : fonctions PURES, sans base ni réseau, testées
// dans __tests__/rules.test.ts. Le moteur (engine.ts) et les deux bases (SQLite sur téléphone, mémoire pour
// l'aperçu web) appliquent exactement ces décisions.
import {
  PLAUSIBLE_MAX_MG_DL,
  PLAUSIBLE_MIN_MG_DL,
  type LifeEventDto,
  type MeasurementDto,
  type SyncOp,
  type SyncOpResult,
} from '@glyka/shared';
import type { OutboxRow } from '@/db/repositories/outbox.repo';
import type { EventRow, MeasurementRow } from '@/db/repositories/plans';
import { coalesceOps } from './coalesce';

/** Opérations envoyées par lot (maximum accepté par POST /sync/push). */
export const PUSH_BATCH = 200;
/** Changements demandés par page à GET /sync/pull (valeur par défaut du serveur). */
export const PULL_PAGE = 200;
/** Lots envoyés et pages reçues au plus par cycle : la suite part dans un cycle suivant (jamais de boucle). */
export const MAX_PUSH_BATCHES = 20;
export const MAX_PULL_PAGES = 50;
/** Cycles enchaînés sans pause au plus (suite d'un gros envoi, saisies pendant un cycle) : jamais de boucle. */
export const MAX_CHAINED_CYCLES = 5;
/** Nouvel essai après un échec : 2 s, 4 s, 8 s… jusqu'à 5 minutes (ADR-0004). */
export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 5 * 60_000;
/** Après une saisie : on attend 3 s (plusieurs saisies rapprochées partent ensemble). */
export const WRITE_DEBOUNCE_MS = 3_000;

/** Délai avant le nouvel essai, après `failures` échecs consécutifs (1 ⇒ 2 s, 2 ⇒ 4 s…, plafond 5 min). */
export function retryDelay(failures: number): number {
  const exponent = Math.min(Math.max(failures, 1) - 1, 30);
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
}

export type SyncEntity = 'measurement' | 'event';

/** Opération envoyée, avec ce qu'il faut pour la régler à la réponse. */
export interface SentOp {
  opId: string;
  seq: number;
  entity: SyncEntity;
  entityId: string;
}

/**
 * Lot à envoyer : la file (dans l'ordre) est d'abord COALESCÉE (coalesce.ts) : pour une même donnée, seule
 * la dernière opération part, car elle porte l'objet complet (ou la suppression). Les opérations plus
 * anciennes de la même donnée sont retirées de la file quand la réponse arrive (`settle`).
 */
export function buildPushBatch(rows: OutboxRow[]): { ops: SyncOp[]; sent: SentOp[] } {
  const queued = rows.map((row) => ({
    row,
    seq: row.seq,
    opId: row.op_id,
    entity: row.entity,
    entityId: row.entity_id,
    type: row.type,
  }));
  const kept = coalesceOps(queued).slice(0, PUSH_BATCH);
  return {
    ops: kept.map(({ row }) => ({
      opId: row.op_id,
      entity: row.entity,
      type: row.type,
      entityId: row.entity_id,
      clientUpdatedAt: row.client_updated_at,
      ...(row.payload ? { payload: JSON.parse(row.payload) as SyncOp['payload'] } : {}),
    })),
    sent: kept.map(({ row }) => ({
      opId: row.op_id,
      seq: row.seq,
      entity: row.entity,
      entityId: row.entity_id,
    })),
  };
}

/**
 * Ce que la base locale doit faire d'une opération envoyée :
 *  - `done` (APPLIED, DUPLICATE, CONFLICT_SERVER_WINS) : la retirer de la file ;
 *  - `rejected` (REJECTED) : la garder avec sa raison, sans la renvoyer (elle serait refusée à nouveau) ;
 *    elle ne bloque pas les autres. L'interface la montrera (L8-10).
 * Dans les deux cas, les opérations PLUS ANCIENNES de la même donnée (remplacées par celle-ci) sont retirées.
 */
export interface Settlement extends SentOp {
  outcome: 'done' | 'rejected';
  reason?: string;
}

export interface PushOutcome {
  settlements: Settlement[];
  /**
   * Au moins un CONFLICT_SERVER_WINS : la version du serveur a gagné. Le curseur de réception est remis à
   * zéro pour être SÛR de la recevoir, même si le téléphone l'avait déjà vue (voir le README).
   */
  conflict: boolean;
  /** Opérations sans réponse du serveur : elles restent dans la file et repartiront. */
  unanswered: number;
}

export function settle(sent: SentOp[], results: SyncOpResult[]): PushOutcome {
  const byOpId = new Map(results.map((r) => [r.opId, r]));
  const settlements: Settlement[] = [];
  let conflict = false;
  let unanswered = 0;
  for (const op of sent) {
    const result = byOpId.get(op.opId);
    if (!result) {
      unanswered++;
      continue;
    }
    if (result.result === 'REJECTED') {
      settlements.push({
        ...op,
        outcome: 'rejected',
        reason: result.reason ?? 'Opération refusée.',
      });
      continue;
    }
    if (result.result === 'CONFLICT_SERVER_WINS') conflict = true;
    settlements.push({ ...op, outcome: 'done' });
  }
  return { settlements, conflict, unanswered };
}

/** Une donnée reçue du serveur est-elle « inhabituelle » (hors 20–600 mg/dL, donc confirmée) ? */
const unusual = (mgDl: number) => mgDl < PLAUSIBLE_MIN_MG_DL || mgDl > PLAUSIBLE_MAX_MG_DL;

const utc = (iso: string) => new Date(iso).toISOString();
const later = (a: string, b: string) => (a > b ? a : b);

/**
 * Mesure reçue du serveur ⇒ ligne locale. `client_updated_at` ne recule jamais : le serveur compare ces
 * dates (« la dernière écriture gagne ») et la prochaine modification sur le téléphone doit passer devant
 * la version reçue (voir editStamp, plans.ts). La confirmation « inhabituelle » se déduit de la valeur : le
 * serveur n'accepte une valeur hors bornes que confirmée.
 */
export function measurementFromRemote(
  dto: MeasurementDto,
  local: MeasurementRow | null,
): MeasurementRow {
  const updatedAt = utc(dto.updatedAt);
  return {
    id: dto.id,
    value_mgdl: dto.valueMgDl,
    original_value: dto.originalValue,
    original_unit: dto.originalUnit,
    measured_at: utc(dto.measuredAt),
    context: dto.context,
    source: dto.source,
    import_batch_id: dto.importBatchId,
    note: dto.note,
    confirmed_unusual: unusual(dto.valueMgDl) ? 1 : 0,
    client_updated_at: local ? later(local.client_updated_at, updatedAt) : updatedAt,
    updated_at: updatedAt,
    deleted_at: dto.deletedAt ? utc(dto.deletedAt) : null,
    pending_sync: 0,
  };
}

/** Événement reçu du serveur ⇒ ligne locale (mêmes règles que les mesures). */
export function eventFromRemote(dto: LifeEventDto, local: EventRow | null): EventRow {
  const updatedAt = utc(dto.updatedAt);
  return {
    id: dto.id,
    type: dto.type,
    occurred_at: utc(dto.occurredAt),
    label: dto.label,
    details: dto.details,
    duration_minutes: dto.durationMinutes,
    client_updated_at: local ? later(local.client_updated_at, updatedAt) : updatedAt,
    updated_at: updatedAt,
    deleted_at: dto.deletedAt ? utc(dto.deletedAt) : null,
    pending_sync: 0,
  };
}

/**
 * Que faire d'une donnée reçue ?
 *  - Aucune modification locale en attente ⇒ on l'enregistre : le serveur a la version de référence.
 *  - Supprimée sur le serveur ⇒ on l'enregistre AUSSI, et on retire les modifications locales en attente :
 *    une suppression est définitive (le serveur les refuserait).
 *  - Sinon, la modification locale en attente est gardée : elle part au prochain envoi et le serveur
 *    tranche (« la dernière écriture gagne ») ; s'il garde sa version, le conflit remet le curseur à zéro
 *    et elle revient.
 */
export type RemoteDecision = 'save' | 'save-and-drop-pending' | 'keep-local';

export function decideRemote(remoteDeleted: boolean, hasPendingOps: boolean): RemoteDecision {
  if (!hasPendingOps) return 'save';
  return remoteDeleted ? 'save-and-drop-pending' : 'keep-local';
}

/** Ce qu'une page reçue change dans la base locale (calculé AVANT d'écrire, dans la transaction). */
export interface PullPlan {
  measurements: MeasurementRow[];
  events: EventRow[];
  /** Données dont les opérations en attente sont retirées (supprimées sur le serveur). */
  dropPending: { entity: SyncEntity; id: string }[];
  /** Données gardées telles quelles (modification locale en attente). */
  kept: number;
}

export function planPull(
  page: { measurements: MeasurementDto[]; events: LifeEventDto[] },
  local: {
    measurements: Map<string, MeasurementRow>;
    events: Map<string, EventRow>;
    /** Clés « entité:id » des données qui ont une opération en attente (non refusée). */
    pending: Set<string>;
  },
): PullPlan {
  const plan: PullPlan = { measurements: [], events: [], dropPending: [], kept: 0 };
  for (const dto of page.measurements) {
    const decision = decideRemote(
      dto.deletedAt !== null,
      local.pending.has(`measurement:${dto.id}`),
    );
    if (decision === 'keep-local') {
      plan.kept++;
      continue;
    }
    plan.measurements.push(measurementFromRemote(dto, local.measurements.get(dto.id) ?? null));
    if (decision === 'save-and-drop-pending')
      plan.dropPending.push({ entity: 'measurement', id: dto.id });
  }
  for (const dto of page.events) {
    const decision = decideRemote(dto.deletedAt !== null, local.pending.has(`event:${dto.id}`));
    if (decision === 'keep-local') {
      plan.kept++;
      continue;
    }
    plan.events.push(eventFromRemote(dto, local.events.get(dto.id) ?? null));
    if (decision === 'save-and-drop-pending')
      plan.dropPending.push({ entity: 'event', id: dto.id });
  }
  return plan;
}
