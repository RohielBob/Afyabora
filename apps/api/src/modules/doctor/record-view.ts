// Journal des consultations du dossier partagé (L5-12, CDC F7-F8 « chaque consultation est journalisée »).
//
// Règle (décidée avec l'équipe) : une ligne SHARE_VIEWED par MOMENT de lecture, pas par requête.
//  - Ouvrir le dossier fait plusieurs requêtes (résumé, glycémies, chronologie), et la page se relit seule.
//    Une ligne par requête remplirait le journal du patient de doublons : « 14 consultations » pour une
//    seule ouverture. Le patient doit lire QUI a regardé et QUAND, pas le détail technique.
//  - Donc : au plus une ligne par session toutes les 5 minutes (VIEW_LOG_WINDOW_MS). Un médecin qui lit le
//    dossier pendant 20 minutes laisse 4 lignes ; un médecin qui revient 1 h plus tard en laisse une nouvelle.
//  - La ligne est écrite AVANT de lire la moindre donnée, dans une transaction qui VERROUILLE la session
//    (FOR UPDATE, comme le scan et la révocation) : deux requêtes simultanées ne peuvent pas écrire deux
//    lignes, et un arrêt par le patient au même instant passe avant ou après, jamais « entre » (un accès
//    arrêté n'est plus lu ni journalisé). Jamais de lecture sans trace.
//  - Comme toutes les lignes du journal : qui, quoi, quand, quelle session, quelle adresse IP. Jamais de
//    donnée médicale, ni l'onglet consulté.
//  - TÉLÉCHARGEMENT du rapport PDF (L6-02) : une ligne REPORT_DOWNLOADED à CHAQUE téléchargement (jamais
//    regroupée : chaque copie du rapport qui sort est tracée), même verrou, même contrôle, avant la génération.
import type { Prisma } from '@prisma/client';
import { writeAccessLog } from '../audit/access-log';

/** Une seule ligne SHARE_VIEWED par session dans cette fenêtre. */
export const VIEW_LOG_WINDOW_MS = 5 * 60_000;

/** État de la session, lu sous verrou. */
interface LockedSession {
  status: string;
  expiresAt: Date | null;
  patientId: string;
  claimedByDoctorId: string | null;
}

/**
 * Dans la transaction `tx` : verrouille la session, vérifie qu'elle est TOUJOURS ouverte pour ce médecin,
 * puis écrit la ligne de consultation si aucune n'a été écrite dans les 5 dernières minutes.
 * Renvoie faux si l'accès n'est plus ouvert (arrêté ou échu entre-temps) : l'appelant refuse alors la lecture.
 */
export async function recordView(
  tx: Prisma.TransactionClient,
  input: {
    sessionId: string;
    doctorId: string;
    ip?: string | null;
    /** Consultation (par défaut, regroupée par 5 min) ou téléchargement du rapport (toujours écrit). */
    action?: 'SHARE_VIEWED' | 'REPORT_DOWNLOADED';
  },
  clock: () => Date = () => new Date(),
): Promise<boolean> {
  const action = input.action ?? 'SHARE_VIEWED';
  const [session] = await tx.$queryRaw<LockedSession[]>`
    SELECT "status"::text AS "status", "expiresAt", "patientId", "claimedByDoctorId"
    FROM "ShareSession" WHERE "id" = ${input.sessionId}::uuid FOR UPDATE`;
  const now = clock(); // après le verrou : l'instant où la lecture a lieu
  if (
    !session ||
    session.claimedByDoctorId !== input.doctorId ||
    session.status !== 'ACTIVE' ||
    !session.expiresAt ||
    session.expiresAt <= now
  ) {
    return false;
  }
  const recent =
    action === 'SHARE_VIEWED'
      ? await tx.accessLog.findFirst({
          where: {
            sessionId: input.sessionId,
            action: 'SHARE_VIEWED',
            at: { gt: new Date(now.getTime() - VIEW_LOG_WINDOW_MS) },
          },
          select: { id: true },
        })
      : null;
  if (!recent) {
    await writeAccessLog(tx, [
      {
        patientId: session.patientId,
        action,
        at: now,
        actorId: input.doctorId,
        sessionId: input.sessionId,
        ip: input.ip ?? null,
      },
    ]);
  }
  return true;
}
