// L5-04 : fin d'un partage (révocation, expiration) et contrôle de l'accès à chaque requête (ADR-0003).
//
// DELETE /shares/:id (patient) : « Mettre fin à l'accès ».
//  - La session (en attente ou ouverte) passe à REVOKED, `revokedAt` = maintenant ; ses jetons encore
//    valables expirent (un QR affiché ne sert plus). Ligne SHARE_REVOKED dans le journal du patient, avec le
//    médecin concerné s'il y en avait un.
//  - EFFET IMMÉDIAT : il n'y a rien à « propager ». Chaque requête du médecin relit la session en base
//    (requireActiveAccess) : la suivante est refusée.
//  - Session d'un autre patient, ou inconnue : 404 (on ne révèle pas qu'elle existe). Session déjà terminée
//    (révoquée ou expirée) : 204 sans rien changer ; l'application peut renvoyer la demande sans risque.
//  - La session est verrouillée (FOR UPDATE), comme au scan (L5-03) : révocation et scan simultanés passent
//    l'un après l'autre. Révoquée d'abord : le scan échoue. Scannée d'abord : l'accès ouvert est révoqué.
//  - L'heure de la révocation est lue APRÈS le verrou : c'est l'instant où elle prend effet. Lue avant, une
//    révocation qui attend la fin d'un scan serait datée d'avant le scan (`revokedAt` < `claimedAt`, et
//    « arrêté » avant « scanné » dans le journal du patient). Défaut trouvé par le test de concurrence.
//
// GET /shares/:id/status (patient) : état de la session, pour l'écran « Dr X consulte » (L5-08).
//  - Le serveur est la seule horloge : `remainingSeconds` est calculé ici, jamais sur le téléphone.
//  - Une session échue est expirée tout de suite (share-expiry.ts), sans attendre la tâche planifiée.
//
// requireActiveAccess() : le contrôle que CHAQUE route médecin (dossier partagé, L5-12 / L5-15) fera avant
// de lire une donnée. Session ACTIVE, de CE médecin, pas échue (horloge du serveur), catégorie partagée.
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ShareCategory, ShareStatus, ShareStatusResponse } from '@glyka/shared';
import { notFound } from '../../common/data/owned-records';
import { writeAccessLog } from '../audit/access-log';
import { PrismaService } from '../../prisma/prisma.service';
import { expireDueSessions } from './share-expiry';
import {
  busyAsUnavailable,
  CREATE_TRANSACTION,
  SESSION_NOT_FOUND_MESSAGE,
} from './sharing.service';

export const SESSION_EXPIRED_MESSAGE =
  'Ce partage a expiré. Le patient peut vous montrer un nouveau QR.';
export const SESSION_REVOKED_MESSAGE = 'Le patient a mis fin à ce partage.';
export const NOT_YOUR_SESSION_MESSAGE = "Ce partage n'a pas été ouvert par votre compte.";
export const CATEGORY_NOT_SHARED_MESSAGE = "Le patient n'a pas partagé ces données avec vous.";

/** Ce dont une route médecin a besoin une fois l'accès vérifié. */
export interface ActiveAccess {
  sessionId: string;
  patientId: string;
  categories: ShareCategory[];
  expiresAt: Date;
}

/** Secondes d'accès restantes (arrondies au-dessus : 0,2 s restante s'affiche « 1 s »), jamais négatives. */
export function remainingSeconds(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

@Injectable()
export class ShareLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /** DELETE /shares/:id (L5-04). */
  async revoke(
    patientId: string,
    sessionId: string,
    clock: () => Date = () => new Date(),
  ): Promise<void> {
    await this.prisma
      .$transaction(async (tx) => {
        // Une session déjà échue est d'abord expirée : le journal dit « expiré », pas « arrêté ».
        await expireDueSessions(tx, clock(), sessionId);
        const [session] = await tx.$queryRaw<
          { patientId: string; status: ShareStatus; claimedByDoctorId: string | null }[]
        >`
          SELECT "patientId", "status"::text AS "status", "claimedByDoctorId"
          FROM "ShareSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
        if (!session || session.patientId !== patientId) {
          throw notFound(SESSION_NOT_FOUND_MESSAGE);
        }
        if (session.status !== 'PENDING' && session.status !== 'ACTIVE') return;
        const now = clock(); // après le verrou : l'instant où la révocation prend effet
        await tx.shareSession.update({
          where: { id: sessionId },
          data: { status: 'REVOKED', revokedAt: now },
        });
        await tx.shareToken.updateMany({
          where: { sessionId, usedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        });
        await writeAccessLog(tx, [
          {
            patientId,
            actorId: session.claimedByDoctorId,
            sessionId,
            action: 'SHARE_REVOKED',
            at: now,
          },
        ]);
      }, CREATE_TRANSACTION)
      .catch(busyAsUnavailable);
  }

  /** GET /shares/:id/status (L5-04). */
  async status(
    patientId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<ShareStatusResponse> {
    await this.prisma
      .$transaction((tx) => expireDueSessions(tx, now, sessionId), CREATE_TRANSACTION)
      .catch(busyAsUnavailable);
    const session = await this.prisma.shareSession.findUnique({
      where: { id: sessionId },
      select: {
        patientId: true,
        status: true,
        claimedAt: true,
        expiresAt: true,
        claimedByDoctor: { select: { firstName: true, lastName: true, institution: true } },
      },
    });
    if (!session || session.patientId !== patientId) throw notFound(SESSION_NOT_FOUND_MESSAGE);
    return {
      status: session.status,
      expiresAt: session.expiresAt?.toISOString() ?? null,
      claimedAt: session.claimedAt?.toISOString() ?? null,
      doctor: session.claimedByDoctor
        ? {
            firstName: session.claimedByDoctor.firstName,
            lastName: session.claimedByDoctor.lastName,
            institution: session.claimedByDoctor.institution,
          }
        : null,
      remainingSeconds:
        session.status === 'ACTIVE' ? remainingSeconds(session.expiresAt, now) : null,
    };
  }

  /**
   * Contrôle d'accès d'une route médecin, À CHAQUE requête (README du module `doctor`) :
   * session inconnue ⇒ 404 ; pas ouverte par CE médecin ⇒ 403 ; révoquée ⇒ 403 SESSION_REVOKED ;
   * expirée ou échue (horloge du serveur) ⇒ 403 SESSION_EXPIRED ; `category` non partagée ⇒ 403
   * CATEGORY_NOT_SHARED. Sinon : l'accès (patient, catégories, fin).
   */
  async requireActiveAccess(
    doctorId: string,
    sessionId: string,
    options: { category?: ShareCategory; now?: Date } = {},
  ): Promise<ActiveAccess> {
    const now = options.now ?? new Date();
    const session = await this.prisma.shareSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        patientId: true,
        status: true,
        categories: true,
        expiresAt: true,
        claimedByDoctorId: true,
      },
    });
    if (!session) throw notFound(SESSION_NOT_FOUND_MESSAGE);
    if (session.claimedByDoctorId !== doctorId) {
      throw new ForbiddenException({ message: NOT_YOUR_SESSION_MESSAGE });
    }
    if (session.status === 'REVOKED') {
      throw new ForbiddenException({ message: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED' });
    }
    if (session.status !== 'ACTIVE' || !session.expiresAt || session.expiresAt <= now) {
      if (session.status === 'ACTIVE') {
        await this.prisma
          .$transaction((tx) => expireDueSessions(tx, now, sessionId), CREATE_TRANSACTION)
          .catch(busyAsUnavailable);
      }
      throw new ForbiddenException({ message: SESSION_EXPIRED_MESSAGE, code: 'SESSION_EXPIRED' });
    }
    const categories = session.categories as ShareCategory[];
    if (options.category && !categories.includes(options.category)) {
      throw new ForbiddenException({
        message: CATEGORY_NOT_SHARED_MESSAGE,
        code: 'CATEGORY_NOT_SHARED',
      });
    }
    return {
      sessionId: session.id,
      patientId: session.patientId,
      categories,
      expiresAt: session.expiresAt,
    };
  }
}
