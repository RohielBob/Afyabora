// Expiration des accès (L5-04, ADR-0003) : un accès ouvert (ACTIVE) dont l'heure de fin est passée devient
// EXPIRED, et c'est écrit dans le journal du patient (SHARE_EXPIRED, à l'heure de fin réelle).
// Deux chemins, une seule règle :
//  - la TÂCHE PLANIFIÉE (ShareExpiryJob, chaque minute) range les sessions échues, même si personne ne les
//    consulte : le journal du patient est complet ;
//  - le CONTRÔLE À CHAQUE REQUÊTE (état du partage, accès du médecin) n'attend pas la tâche : une session
//    échue est expirée sur-le-champ. Entre deux passages de la tâche, l'accès n'est donc jamais prolongé.
// Les sessions sont verrouillées (FOR UPDATE) puis revérifiées : la tâche, une requête et une révocation
// simultanées ne l'expirent qu'une fois (une seule ligne de journal), et une session révoquée entre-temps
// reste révoquée. La tâche passe les sessions déjà verrouillées (SKIP LOCKED) : elle ne bloque personne et
// les reprendra au passage suivant.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAccessLog } from '../audit/access-log';

/** Au plus autant de sessions par passage de la tâche (le reste au passage suivant). */
export const EXPIRY_BATCH = 500;

interface DueSession {
  id: string;
  patientId: string;
  claimedByDoctorId: string | null;
  expiresAt: Date;
}

/**
 * Expire les sessions ACTIVE dont la fin est passée à `now`. `sessionId` : seulement celle-là (contrôle à la
 * requête, attend un éventuel verrou) ; sinon toutes, par lots (tâche planifiée, passe les verrous).
 * Renvoie le nombre de sessions expirées. À appeler dans une transaction (`tx`).
 */
export async function expireDueSessions(
  tx: Prisma.TransactionClient,
  now: Date,
  sessionId?: string,
): Promise<number> {
  const due = await tx.$queryRaw<DueSession[]>`
    SELECT "id", "patientId", "claimedByDoctorId", "expiresAt" FROM "ShareSession"
    WHERE "status" = 'ACTIVE' AND "expiresAt" <= ${now}
    ${sessionId ? Prisma.sql`AND "id" = ${sessionId}::uuid` : Prisma.empty}
    ORDER BY "expiresAt" LIMIT ${EXPIRY_BATCH}
    FOR UPDATE ${sessionId ? Prisma.empty : Prisma.sql`SKIP LOCKED`}`;
  if (due.length === 0) return 0;
  await tx.shareSession.updateMany({
    where: { id: { in: due.map((s) => s.id) }, status: 'ACTIVE' },
    data: { status: 'EXPIRED' },
  });
  await writeAccessLog(
    tx,
    due.map((s) => ({
      patientId: s.patientId,
      actorId: s.claimedByDoctorId,
      sessionId: s.id,
      action: 'SHARE_EXPIRED',
      at: s.expiresAt,
    })),
  );
  return due.length;
}

/** Tâche planifiée : chaque minute, les accès échus passent à EXPIRED. */
@Injectable()
export class ShareExpiryJob {
  private readonly logger = new Logger('ShareExpiry');

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'share-expiry' })
  async run(now = new Date()): Promise<number> {
    try {
      const expired = await this.prisma.$transaction((tx) => expireDueSessions(tx, now));
      if (expired > 0) this.logger.log(`${expired} accès expiré(s)`);
      return expired;
    } catch (error) {
      // Jamais de donnée dans le journal du serveur : seulement le type d'erreur. Le passage suivant
      // reprendra, et le contrôle à chaque requête protège l'accès entre-temps.
      this.logger.warn(`Expiration des accès en échec (${(error as Error)?.name ?? 'erreur'})`);
      return 0;
    }
  }
}
