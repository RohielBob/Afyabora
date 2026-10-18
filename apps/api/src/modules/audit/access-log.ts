// Écriture du journal d'accès du patient (L5-05, ADR-0003) : le SEUL endroit où l'on écrit dans AccessLog.
//  - Les actions sont typées (ACCESS_ACTIONS de @glyka/shared) : une faute de frappe ne compile pas.
//  - Une ligne = qui (médecin, ou personne pour un accès d'urgence anonyme), quoi (action), quand, sur quelle
//    session, depuis quelle adresse IP. JAMAIS de donnée médicale ni de jeton.
//  - On écrit avec le client fourni : dans la transaction de l'évènement (scan, révocation, expiration), la
//    ligne et l'évènement réussissent ou échouent ensemble ; jamais d'accès sans trace.
//  - Le journal n'est ni modifiable ni supprimable par l'utilisateur : aucune route ne le permet. Il
//    disparaît seulement avec le compte du patient (suppression du compte, L1-14).
import type { Prisma } from '@prisma/client';
import type { AccessAction } from '@glyka/shared';

export interface AccessLogInput {
  patientId: string;
  action: AccessAction;
  /** Instant de l'évènement (horloge du serveur). */
  at: Date;
  /** Le médecin ; absent pour un accès d'urgence anonyme ou une action du patient seul. */
  actorId?: string | null;
  sessionId?: string | null;
  ip?: string | null;
}

/** Écrit une ou plusieurs lignes avec `client` (de préférence la transaction de l'évènement). */
export async function writeAccessLog(
  client: Prisma.TransactionClient,
  entries: AccessLogInput[],
): Promise<void> {
  if (entries.length === 0) return;
  await client.accessLog.createMany({
    data: entries.map((entry) => ({
      patientId: entry.patientId,
      action: entry.action,
      at: entry.at,
      actorId: entry.actorId ?? null,
      sessionId: entry.sessionId ?? null,
      ip: entry.ip ?? null,
    })),
  });
}
