// Plans d'écriture locale (L8-03) : la LOGIQUE des dépôts, sans base de données (testée dans
// __tests__/plans.test.ts). Pour chaque création, modification ou suppression, un plan donne :
//  - la LIGNE à écrire dans la table locale (mesures ou événements) ;
//  - l'OPÉRATION de synchronisation à mettre dans l'outbox, dans la même transaction (ADR-0004).
// Règles :
//  - une opération « upsert » porte toujours l'objet COMPLET (le serveur applique « la dernière écriture
//    gagne ») : une modification reconstruit donc tout le payload à partir de la ligne existante ;
//  - toute opération est vérifiée avec le schéma partagé `syncOpSchema` AVANT d'être écrite : le téléphone
//    ne met jamais en file une opération que le serveur refuserait pour son format ;
//  - les dates sont stockées en ISO UTC (« …Z ») : comparer du texte = comparer des instants ;
//  - une suppression laisse une « pierre tombale » (deleted_at) et efface le texte libre (note, détails),
//    comme le serveur.
import {
  createLifeEventSchema,
  createMeasurementSchema,
  syncOpSchema,
  toMgDl,
  updateLifeEventSchema,
  updateMeasurementSchema,
  type CreateLifeEventInput,
  type CreateMeasurementInput,
  type GlucoseUnit,
  type LifeEventType,
  type MeasurementContext,
  type MeasurementSource,
  type SyncOp,
  type UpdateLifeEventInput,
  type UpdateMeasurementInput,
} from '@glyka/shared';

/** Ligne de la table locale `measurements` (noms des colonnes SQLite). */
export interface MeasurementRow {
  id: string;
  value_mgdl: number;
  original_value: number;
  original_unit: GlucoseUnit;
  measured_at: string;
  context: MeasurementContext;
  source: MeasurementSource;
  import_batch_id: string | null;
  note: string | null;
  /** 1 si la personne a confirmé une valeur hors 20–600 mg/dL (L2-04) ; migration v2. */
  confirmed_unusual: 0 | 1;
  client_updated_at: string;
  updated_at: string;
  deleted_at: string | null;
  pending_sync: 0 | 1;
}

/** Ligne de la table locale `events`. */
export interface EventRow {
  id: string;
  type: LifeEventType;
  occurred_at: string;
  label: string;
  details: string | null;
  duration_minutes: number | null;
  client_updated_at: string;
  updated_at: string;
  deleted_at: string | null;
  pending_sync: 0 | 1;
}

/** Identifiants et horloge fournis par l'appelant (le dépôt réel, ou un test). */
export interface PlanContext {
  /** Identifiant de l'opération de synchronisation (UUID). */
  opId: string;
  /** Maintenant, en ISO UTC. */
  now: string;
}

export interface Plan<Row> {
  row: Row;
  op: SyncOp;
}

/** Erreur claire quand une donnée ne respecte pas le schéma partagé (rien n'est écrit). */
export class InvalidLocalWrite extends Error {
  constructor(what: string, issues: string) {
    super(`${what} invalide : ${issues}`);
    this.name = 'InvalidLocalWrite';
  }
}

const utc = (iso: string) => new Date(iso).toISOString();

/** Vérifie l'opération avec le schéma partagé (format, payload complet, id cohérent). */
function checked(op: SyncOp): SyncOp {
  const result = syncOpSchema.safeParse(op);
  if (!result.success) {
    throw new InvalidLocalWrite(
      'Opération de synchronisation',
      result.error.issues.map((i) => i.message).join(' ; '),
    );
  }
  return op;
}

// ---------- Mesures ----------

/** Payload complet d'une mesure, reconstruit depuis sa ligne locale (valeur et unité d'ORIGINE). */
export function measurementPayload(row: MeasurementRow): CreateMeasurementInput {
  return {
    id: row.id,
    value: row.original_value,
    unit: row.original_unit,
    measuredAt: row.measured_at,
    context: row.context,
    ...(row.note ? { note: row.note } : {}),
    confirmedUnusual: row.confirmed_unusual === 1,
  };
}

export function planMeasurementCreate(
  input: CreateMeasurementInput,
  ctx: PlanContext,
  origin: { source?: MeasurementSource; importBatchId?: string | null } = {},
): Plan<MeasurementRow> {
  const parsed = createMeasurementSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidLocalWrite('Mesure', parsed.error.issues.map((i) => i.message).join(' ; '));
  }
  const data = parsed.data;
  const row: MeasurementRow = {
    id: data.id,
    value_mgdl: toMgDl(data.value, data.unit),
    original_value: data.value,
    original_unit: data.unit,
    measured_at: utc(data.measuredAt),
    context: data.context,
    source: origin.source ?? 'MANUAL',
    import_batch_id: origin.importBatchId ?? null,
    note: data.note?.trim() ? data.note.trim() : null,
    confirmed_unusual: data.confirmedUnusual ? 1 : 0,
    client_updated_at: ctx.now,
    updated_at: ctx.now,
    deleted_at: null,
    pending_sync: 1,
  };
  return {
    row,
    op: checked({
      opId: ctx.opId,
      entity: 'measurement',
      type: 'upsert',
      entityId: row.id,
      clientUpdatedAt: ctx.now,
      payload: measurementPayload(row),
    }),
  };
}

/**
 * Modification : on part de la ligne existante, on applique les champs donnés, et on renvoie l'objet
 * complet. Changer la valeur (ou l'unité) annule la confirmation « inhabituelle », sauf si elle est
 * redonnée avec la nouvelle valeur (on ne confirme qu'une valeur précise, comme à la saisie).
 */
export function planMeasurementUpdate(
  current: MeasurementRow,
  patch: UpdateMeasurementInput,
  ctx: PlanContext,
): Plan<MeasurementRow> {
  if (current.deleted_at) throw new InvalidLocalWrite('Mesure', 'elle a été supprimée');
  const parsed = updateMeasurementSchema.safeParse(patch);
  if (!parsed.success) {
    throw new InvalidLocalWrite(
      'Modification',
      parsed.error.issues.map((i) => i.message).join(' ; '),
    );
  }
  const p = parsed.data;
  const valueChanged = p.value !== undefined && p.unit !== undefined;
  const value = valueChanged ? (p.value as number) : current.original_value;
  const unit = valueChanged ? (p.unit as GlucoseUnit) : current.original_unit;
  const note = p.note === undefined ? current.note : p.note.trim() ? p.note.trim() : null;
  const confirmed =
    p.confirmedUnusual !== undefined
      ? p.confirmedUnusual
      : valueChanged
        ? false
        : current.confirmed_unusual === 1;

  const row: MeasurementRow = {
    ...current,
    value_mgdl: toMgDl(value, unit),
    original_value: value,
    original_unit: unit,
    measured_at: p.measuredAt !== undefined ? utc(p.measuredAt) : current.measured_at,
    context: p.context ?? current.context,
    note,
    confirmed_unusual: confirmed ? 1 : 0,
    client_updated_at: ctx.now,
    updated_at: ctx.now,
    pending_sync: 1,
  };
  // Le payload complet doit rester valide (ex. note de plus de 500 caractères refusée par le schéma).
  const full = createMeasurementSchema.safeParse(measurementPayload(row));
  if (!full.success) {
    throw new InvalidLocalWrite('Mesure', full.error.issues.map((i) => i.message).join(' ; '));
  }
  return {
    row,
    op: checked({
      opId: ctx.opId,
      entity: 'measurement',
      type: 'upsert',
      entityId: row.id,
      clientUpdatedAt: ctx.now,
      payload: measurementPayload(row),
    }),
  };
}

/** Suppression : pierre tombale (deleted_at) + note effacée ; opération « delete » sans payload. */
export function planMeasurementDelete(
  current: MeasurementRow,
  ctx: PlanContext,
): Plan<MeasurementRow> {
  return {
    row: {
      ...current,
      note: null,
      deleted_at: current.deleted_at ?? ctx.now,
      client_updated_at: ctx.now,
      updated_at: ctx.now,
      pending_sync: 1,
    },
    op: checked({
      opId: ctx.opId,
      entity: 'measurement',
      type: 'delete',
      entityId: current.id,
      clientUpdatedAt: ctx.now,
    }),
  };
}

// ---------- Événements (repas, activité, traitement déclaré) ----------

export function eventPayload(row: EventRow): CreateLifeEventInput {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    label: row.label,
    ...(row.details ? { details: row.details } : {}),
    ...(row.duration_minutes !== null ? { durationMinutes: row.duration_minutes } : {}),
  };
}

export function planEventCreate(input: CreateLifeEventInput, ctx: PlanContext): Plan<EventRow> {
  const parsed = createLifeEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidLocalWrite('Événement', parsed.error.issues.map((i) => i.message).join(' ; '));
  }
  const data = parsed.data;
  const row: EventRow = {
    id: data.id,
    type: data.type,
    occurred_at: utc(data.occurredAt),
    label: data.label,
    details: data.details?.trim() ? data.details.trim() : null,
    duration_minutes: data.durationMinutes ?? null,
    client_updated_at: ctx.now,
    updated_at: ctx.now,
    deleted_at: null,
    pending_sync: 1,
  };
  return {
    row,
    op: checked({
      opId: ctx.opId,
      entity: 'event',
      type: 'upsert',
      entityId: row.id,
      clientUpdatedAt: ctx.now,
      payload: eventPayload(row),
    }),
  };
}

export function planEventUpdate(
  current: EventRow,
  patch: UpdateLifeEventInput,
  ctx: PlanContext,
): Plan<EventRow> {
  if (current.deleted_at) throw new InvalidLocalWrite('Événement', 'il a été supprimé');
  const parsed = updateLifeEventSchema.safeParse(patch);
  if (!parsed.success) {
    throw new InvalidLocalWrite(
      'Modification',
      parsed.error.issues.map((i) => i.message).join(' ; '),
    );
  }
  const p = parsed.data;
  const row: EventRow = {
    ...current,
    type: p.type ?? current.type,
    occurred_at: p.occurredAt !== undefined ? utc(p.occurredAt) : current.occurred_at,
    label: p.label ?? current.label,
    details: p.details === undefined ? current.details : p.details.trim() ? p.details.trim() : null,
    duration_minutes: p.durationMinutes ?? current.duration_minutes,
    client_updated_at: ctx.now,
    updated_at: ctx.now,
    pending_sync: 1,
  };
  return {
    row,
    op: checked({
      opId: ctx.opId,
      entity: 'event',
      type: 'upsert',
      entityId: row.id,
      clientUpdatedAt: ctx.now,
      payload: eventPayload(row),
    }),
  };
}

/** Suppression : pierre tombale + détails effacés (texte libre, potentiellement sensible). */
export function planEventDelete(current: EventRow, ctx: PlanContext): Plan<EventRow> {
  return {
    row: {
      ...current,
      details: null,
      deleted_at: current.deleted_at ?? ctx.now,
      client_updated_at: ctx.now,
      updated_at: ctx.now,
      pending_sync: 1,
    },
    op: checked({
      opId: ctx.opId,
      entity: 'event',
      type: 'delete',
      entityId: current.id,
      clientUpdatedAt: ctx.now,
    }),
  };
}
