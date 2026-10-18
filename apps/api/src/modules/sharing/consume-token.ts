// Consommation d'un jeton de QR (L5-02, ADR-0003) : le cœur de l'« usage unique ».
// La route du médecin (POST /shares/claim, L5-03) appellera consumeShareToken() DANS sa transaction, puis
// ouvrira l'accès (session ACTIVE, médecin rattaché) dans cette même transaction.
//
// Un jeton n'est accepté que s'il est, au moment du scan :
//  - bien formé (sinon, aucune lecture en base) ;
//  - connu (son hash est en base) ;
//  - rattaché à une session ENCORE EN ATTENTE (pas déjà ouverte, expirée ni révoquée) ;
//  - jamais utilisé, et dans ses 60 s de validité (un jeton remplacé par une rotation est déjà expiré).
// Dans tous les autres cas : `null`, sans dire pourquoi (la route renverra TOKEN_INVALID, sans précision).
//
// Atomicité : deux scans SIMULTANÉS du même QR ne peuvent pas réussir tous les deux.
//  1. On verrouille la ligne de la session (SELECT … FOR UPDATE). La rotation (GET /shares/:id/token)
//     prend le même verrou : scan et rotation d'une même session passent l'un après l'autre, toujours
//     dans le même ordre (session puis jetons), donc sans interblocage.
//  2. Le jeton est marqué utilisé par une mise à jour CONDITIONNELLE (« seulement s'il ne l'est pas
//     déjà ») : le second scan, qui attendait le verrou, ne trouve plus rien à mettre à jour.
//  3. Les autres jetons encore valides de la session expirent : un QR consommé ferme la session à tout
//     autre scan, même avec un jeton plus récent.
import type { Prisma } from '@prisma/client';
import type { ShareStatus } from '@glyka/shared';
import { hashShareToken, isWellFormedShareToken } from './share-token';

/** Session dont un jeton vient d'être consommé : ce dont la route du médecin (L5-03) aura besoin. */
export interface ConsumedShare {
  sessionId: string;
  patientId: string;
  categories: string[];
  duration: string;
}

interface LockedSession {
  id: string;
  patientId: string;
  status: ShareStatus;
  categories: string[];
  duration: string;
}

/**
 * Consomme `token` à l'instant `now`. À appeler dans une transaction Prisma (`tx`) : le verrou et la
 * consommation ne valent que jusqu'à sa fin. Renvoie la session, ou `null` si le jeton ne peut pas servir.
 */
export async function consumeShareToken(
  tx: Prisma.TransactionClient,
  token: unknown,
  now: Date,
): Promise<ConsumedShare | null> {
  if (!isWellFormedShareToken(token)) return null;
  const tokenHash = hashShareToken(token);
  const found = await tx.shareToken.findUnique({
    where: { tokenHash },
    select: { sessionId: true },
  });
  if (!found) return null;

  const [session] = await tx.$queryRaw<LockedSession[]>`
    SELECT "id", "patientId", "status"::text AS "status", "categories", "duration"
    FROM "ShareSession" WHERE "id" = ${found.sessionId}::uuid FOR UPDATE`;
  if (!session || session.status !== 'PENDING') return null;

  // Relue APRÈS le verrou : ne réussit que si personne n'a utilisé ni remplacé ce jeton entre-temps.
  const used = await tx.shareToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (used.count !== 1) return null;

  await tx.shareToken.updateMany({
    where: { sessionId: session.id, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return {
    sessionId: session.id,
    patientId: session.patientId,
    categories: session.categories,
    duration: session.duration,
  };
}
