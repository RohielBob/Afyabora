// Synchronisation hors-ligne, envoi (ticket L8-04, CDC F11, ADR-0004) : POST /sync/push.
//
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
import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  syncOpSchema,
  type SyncOp,
  type SyncOpResult,
  type SyncPushEnvelope,
  type SyncPushResponse,
} from '@glyka/shared';
import type { ZodError } from 'zod';
import {
  FUTURE_TOLERANCE_MS,
  hasPrismaCode,
  type SyncOutcome,
} from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MeasurementsService } from '../measurements/measurements.service';

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
