// Synchronisation hors-ligne (CDC F11, ADR-0004) : envoi POST /sync/push (L8-04) et réception
// GET /sync/pull (L8-05, en bas du fichier).
//
// ENVOI (L8-04)
// Le téléphone écrit d'abord chez lui (SQLite) et empile des opérations ; il les envoie par lots de 200.
// Règles (ADR-0004 et ses modifications du 2026-10-09) :
//  - modification 1 : l'ENVELOPPE est validée par la route (deviceId, 200 opérations au plus), puis CHAQUE
//    opération séparément avec `syncOpSchema` : une opération invalide reçoit REJECTED + sa raison, les
//    autres sont appliquées (jamais un 400 pour tout le lot) ;
//  - idempotence : une opération déjà traitée (même `opId`, table SyncOpLog) répond DUPLICATE et n'est
//    jamais réappliquée ; rejouer tout un lot ne crée aucun doublon ;
//  - modification 5 : « la dernière écriture gagne » sur `clientUpdatedAt` (CONFLICT_SERVER_WINS sinon),
//    et une horloge d'appareil en avance de plus de 5 minutes est refusée ;
//  - une seule logique métier : les contrôles (valeur plausible, date pas dans le futur, textes chiffrés)
//    sont ceux de MeasurementsService et EventsService ;
//  - les opérations d'un lot sont appliquées DANS L'ORDRE (créer puis supprimer la même mesure marche).
// Seules les opérations APPLIED et CONFLICT_SERVER_WINS sont notées dans SyncOpLog : une opération REJECTED
// est réexaminée si elle revient (une date « future » peut devenir valable). Aucune donnée de santé dans les
// journaux, ni dans les raisons renvoyées.
//
// RÉCEPTION (L8-05) : les changements du patient (mesures ET événements, suppressions comprises), dans
// l'ordre (`updatedAt`, `id`) croissant, par pages de `limit` (200 par défaut, 500 au plus).
//  - Pendant la lecture, le curseur avance STRICTEMENT après la dernière ligne rendue : aucune ligne perdue
//    ni répétée, même quand des centaines de lignes ont la même milliseconde (un import entier).
//  - À la DERNIÈRE page (`hasMore` faux), si la dernière ligne lue date de MOINS de PULL_OVERLAP_MS (heure
//    du serveur), le curseur rendu recule de cette marge (ADR-0004, modification 4) : la synchronisation
//    suivante relit ces quelques secondes et rattrape une ligne écrite par une transaction lente (date plus
//    ancienne, validée après coup). Le téléphone applique tout de façon idempotente. Si la dernière ligne
//    est plus ancienne que la marge, aucune écriture plus ancienne ne peut encore arriver : pas de recul,
//    donc pas de relecture inutile (après un import de 141 mesures, elles ne sont pas retéléchargées à
//    chaque synchronisation). Ce recul n'a lieu qu'en fin de lecture : la pagination ne peut pas boucler.
//  - Rien de nouveau : le curseur reçu est rendu tel quel (il ne recule pas à chaque appel).
import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  syncOpSchema,
  type SyncPullResponse,
  type SyncOp,
  type SyncOpResult,
  type SyncPushEnvelope,
  type SyncPushResponse,
  type syncPullQuerySchema,
} from '@glyka/shared';
import type { ZodError, z } from 'zod';
import {
  FUTURE_TOLERANCE_MS,
  invalidField,
  type SyncPosition,
  hasPrismaCode,
  type SyncOutcome,
} from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MeasurementsService } from '../measurements/measurements.service';

export type SyncPullQuery = z.output<typeof syncPullQuerySchema>;

/** Marge relue en fin de synchronisation (ADR-0004, modification 4). */
export const PULL_OVERLAP_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Curseur opaque : position (date ISO + identifiant, ou null pour la marge) en base64url. */
export function encodeSyncCursor(position: SyncPosition): string {
  return Buffer.from(JSON.stringify([position.at.toISOString(), position.id])).toString(
    'base64url',
  );
}

/** Curseur reçu ⇒ position ; illisible ⇒ 400 sur `cursor` (recommencer depuis le début). */
export function decodeSyncCursor(cursor: string): SyncPosition {
  try {
    const [iso, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown[];
    const at = new Date(String(iso));
    const validId = id === null || (typeof id === 'string' && UUID.test(id));
    if (typeof iso !== 'string' || Number.isNaN(at.getTime()) || !validId)
      throw new Error('curseur');
    return { at, id: id as string | null };
  } catch {
    throw invalidField(
      'cursor',
      'Curseur invalide : recommencez la synchronisation depuis le début.',
    );
  }
}

export const CLOCK_AHEAD_REASON =
  'Horloge de l’appareil en avance de plus de 5 minutes : opération refusée.';
export const ID_TAKEN_REASON = 'Identifiant déjà utilisé : générez-en un nouveau.';
export const OP_ID_TAKEN_REASON = 'Identifiant d’opération déjà utilisé : générez-en un nouveau.';

/**
 * Raison lisible d'une opération mal formée : le premier problème, avec le champ, en français et sans la
 * valeur reçue. Les messages par défaut de Zod sont en anglais (« Invalid input ») : on les remplace par une
 * phrase selon le TYPE de problème ; les messages écrits par nos schémas (déjà en français) sont gardés.
 */
export function invalidReason(error: ZodError): string {
  const [issue] = error.issues;
  if (!issue) return 'Opération invalide.';
  // Les messages « custom » (écrits par nos schémas, en français) n'ont pas d'entrée : ils sont gardés.
  const french: Partial<Record<string, string>> = {
    invalid_type: 'champ manquant ou de mauvais type',
    invalid_union: 'contenu invalide pour cette entité',
    invalid_string: 'format invalide',
    invalid_enum_value: 'valeur non reconnue',
    invalid_date: 'date invalide',
    too_small: 'valeur trop petite ou trop courte',
    too_big: 'valeur trop grande ou trop longue',
    unrecognized_keys: 'champ inconnu',
  };
  const message = french[issue.code] ?? issue.message;
  const path = issue.path.join('.');
  return path ? `${path} : ${message}` : message;
}

/** Erreur d'un service (400, 422…) ⇒ raison du REJECTED : le message du champ, sinon le message. */
function refusalReason(error: HttpException): string {
  const body = error.getResponse() as { message?: unknown; issues?: { message?: unknown }[] };
  const fieldMessage = body?.issues?.[0]?.message;
  if (typeof fieldMessage === 'string') return fieldMessage;
  return typeof body?.message === 'string' ? body.message : 'Opération refusée.';
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurements: MeasurementsService,
    private readonly events: EventsService,
  ) {}

  /** POST /sync/push : un résultat par opération reçue, dans le même ordre. */
  async push(
    patientId: string,
    envelope: SyncPushEnvelope,
    now = new Date(),
  ): Promise<SyncPushResponse> {
    await this.requireProfile(patientId);
    const results: SyncOpResult[] = [];
    for (const raw of envelope.ops) {
      results.push(await this.applyOne(patientId, envelope.deviceId, raw, now));
    }
    return { results, serverTime: now.toISOString() };
  }

  private async applyOne(
    patientId: string,
    deviceId: string,
    raw: unknown,
    now: Date,
  ): Promise<SyncOpResult> {
    const rawOpId = (raw as { opId?: unknown } | null)?.opId;
    const opId = typeof rawOpId === 'string' ? rawOpId : '';
    const parsed = syncOpSchema.safeParse(raw);
    if (!parsed.success) return { opId, result: 'REJECTED', reason: invalidReason(parsed.error) };
    const op = parsed.data;

    const logged = await this.prisma.syncOpLog.findUnique({
      where: { opId: op.opId },
      select: { patientId: true },
    });
    if (logged) {
      return logged.patientId === patientId
        ? { opId, result: 'DUPLICATE' }
        : { opId, result: 'REJECTED', reason: OP_ID_TAKEN_REASON };
    }

    const clientUpdatedAt = new Date(op.clientUpdatedAt);
    if (clientUpdatedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      return { opId, result: 'REJECTED', reason: CLOCK_AHEAD_REASON };
    }

    let outcome: SyncOutcome;
    try {
      outcome = await this.dispatch(patientId, op, clientUpdatedAt, now);
    } catch (error) {
      // Donnée refusée par la logique métier (valeur hors bornes non confirmée, date future…).
      if (error instanceof HttpException && error.getStatus() < 500 && error.getStatus() !== 401) {
        return { opId, result: 'REJECTED', reason: refusalReason(error) };
      }
      throw error;
    }
    if (outcome === 'NOT_OWNED') return { opId, result: 'REJECTED', reason: ID_TAKEN_REASON };

    try {
      await this.prisma.syncOpLog.create({
        data: { opId: op.opId, patientId, deviceId, result: outcome },
      });
    } catch (error) {
      // Même opération reçue deux fois EN MÊME TEMPS : l'autre envoi l'a notée ; l'application est
      // idempotente (même date, même contenu), le résultat reste valable.
      if (!hasPrismaCode(error, 'P2002')) throw error;
    }
    return { opId, result: outcome };
  }

  private dispatch(
    patientId: string,
    op: SyncOp,
    clientUpdatedAt: Date,
    now: Date,
  ): Promise<SyncOutcome> {
    if (op.type === 'delete') {
      return op.entity === 'measurement'
        ? this.measurements.syncDelete(patientId, op.entityId, clientUpdatedAt, now)
        : this.events.syncDelete(patientId, op.entityId, clientUpdatedAt, now);
    }
    // Le schéma garantit un payload de la bonne entité, avec payload.id = entityId.
    const payload = op.payload as NonNullable<SyncOp['payload']>;
    return op.entity === 'measurement'
      ? this.measurements.syncUpsert(
          patientId,
          payload as Parameters<MeasurementsService['syncUpsert']>[1],
          clientUpdatedAt,
          now,
        )
      : this.events.syncUpsert(
          patientId,
          payload as Parameters<EventsService['syncUpsert']>[1],
          clientUpdatedAt,
          now,
        );
  }

  /** GET /sync/pull : une page de changements (voir l'en-tête du fichier). */
  async pull(patientId: string, query: SyncPullQuery, now = new Date()): Promise<SyncPullResponse> {
    const after = query.cursor ? decodeSyncCursor(query.cursor) : null;
    const take = query.limit + 1; // une de plus par entité : savoir s'il reste des changements
    const [measurements, events] = await Promise.all([
      this.measurements.changedSince(patientId, after, take),
      this.events.changedSince(patientId, after, take),
    ]);
    // Les deux listes sont déjà triées : on les fusionne dans le même ordre (`updatedAt`, `id`).
    const merged = [
      ...measurements.map((item) => ({ ...item, entity: 'measurement' as const })),
      ...events.map((item) => ({ ...item, entity: 'event' as const })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const page = merged.slice(0, query.limit);
    const hasMore = merged.length > query.limit;
    const last = page.at(-1);

    let nextCursor: string | null;
    if (!last) nextCursor = query.cursor ?? null;
    else if (hasMore) nextCursor = encodeSyncCursor({ at: last.at, id: last.id });
    else if (last.at.getTime() > now.getTime() - PULL_OVERLAP_MS) {
      nextCursor = encodeSyncCursor({
        at: new Date(last.at.getTime() - PULL_OVERLAP_MS),
        id: null,
      });
    } else nextCursor = encodeSyncCursor({ at: last.at, id: last.id });

    return {
      measurements: page.flatMap((item) => (item.entity === 'measurement' ? [item.dto] : [])),
      events: page.flatMap((item) => (item.entity === 'event' ? [item.dto] : [])),
      nextCursor,
      hasMore,
      serverTime: now.toISOString(),
    };
  }

  /** Sans profil médical, rien ne peut être enregistré : compte supprimé ⇒ 401, sinon 400 explicite. */
  private async requireProfile(patientId: string): Promise<void> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: { userId: true },
    });
    if (profile) return;
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    throw new BadRequestException({
      message: 'Complétez votre profil médical avant de synchroniser vos données.',
    });
  }
}
