// L5-03 : POST /shares/claim. Le médecin scanne le QR du patient : l'accès s'ouvre (ADR-0003, CDC F7).
//  - Seul un médecin APPROUVÉ peut scanner (rôle vérifié par @Roles, approbation vérifiée ici) : sinon 403
//    DOCTOR_NOT_APPROVED, AVANT toute lecture du jeton : un compte en attente ne « brûle » pas le QR du
//    patient. Compte supprimé (jeton de connexion encore valable) : 401. Ces refus ne comptent pas comme
//    des scans ratés : aucun jeton n'a été essayé.
//  - Blocage après 5 scans ratés en une minute, par adresse IP et par compte (claim-limiter.ts) : 429.
//  - Le jeton est consommé de façon atomique (consume-token.ts) puis, dans la MÊME transaction :
//      la session passe à ACTIVE, rattachée à ce médecin ; la durée démarre maintenant
//      (`expiresAt = claimedAt + durée`, « Consultation » : 2 h au plus) ;
//      le scan est écrit dans le journal d'accès du patient (SHARE_CLAIMED).
//    Tout ou rien : jamais d'accès ouvert sans trace dans le journal, ni de jeton brûlé sans accès.
//  - Jeton invalide, expiré, remplacé, déjà utilisé, ou session plus en attente : TOUJOURS la même réponse
//    404 TOKEN_INVALID « QR invalide ou expiré », sans préciser la raison (on n'aide pas à deviner).
//  - Réponse : la session, la fin de l'accès, les catégories partagées et, du patient, seulement le prénom
//    et le type de diabète (contrat : PatientPublicIdentity). Les données arriveront par les routes du
//    dossier, filtrées par catégorie (L5-12).
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SHARE_DURATION_MINUTES,
  type ClaimShareResponse,
  type DiabetesType,
  type ShareCategory,
  type ShareDuration,
} from '@glyka/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAccessLog } from '../audit/access-log';
import { ClaimFailureLimiter } from './claim-limiter';
import { consumeShareToken } from './consume-token';
import { requireApprovedDoctor } from './doctor-approval';
import { busyAsUnavailable, CREATE_TRANSACTION } from './sharing.service';

export const TOKEN_INVALID_MESSAGE = 'QR invalide ou expiré';
// Le contrôle « médecin approuvé » est partagé avec le portail (L5-11) : doctor-approval.ts.
export { DOCTOR_NOT_APPROVED_MESSAGE } from './doctor-approval';

/** Fin de l'accès : heure du scan + durée choisie par le patient. */
export function accessEndsAt(claimedAt: Date, duration: ShareDuration): Date {
  return new Date(claimedAt.getTime() + SHARE_DURATION_MINUTES[duration] * 60_000);
}

@Injectable()
export class ShareClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: ClaimFailureLimiter,
  ) {}

  /** POST /shares/claim (L5-03). `ip` : adresse du médecin (blocage et journal d'accès). */
  async claim(
    doctorId: string,
    token: string,
    ip: string | undefined,
    now = new Date(),
  ): Promise<ClaimShareResponse> {
    await requireApprovedDoctor(this.prisma, doctorId);
    const keys = [`doctor:${doctorId}`, ...(ip ? [`ip:${ip}`] : [])];
    const succeeded = this.limiter.begin(keys, now);

    const opened = await this.prisma
      .$transaction(async (tx) => {
        const consumed = await consumeShareToken(tx, token, now);
        if (!consumed) return null;
        const expiresAt = accessEndsAt(now, consumed.duration as ShareDuration);
        await tx.shareSession.update({
          where: { id: consumed.sessionId },
          data: { status: 'ACTIVE', claimedByDoctorId: doctorId, claimedAt: now, expiresAt },
        });
        await writeAccessLog(tx, [
          {
            patientId: consumed.patientId,
            actorId: doctorId,
            sessionId: consumed.sessionId,
            action: 'SHARE_CLAIMED',
            ip,
            at: now,
          },
        ]);
        const patient = await tx.patientProfile.findUniqueOrThrow({
          where: { userId: consumed.patientId },
          select: { firstName: true, diabetesType: true },
        });
        return { consumed, expiresAt, patient };
      }, CREATE_TRANSACTION)
      .catch(busyAsUnavailable);

    if (!opened) {
      throw new NotFoundException({ message: TOKEN_INVALID_MESSAGE, code: 'TOKEN_INVALID' });
    }
    succeeded();
    return {
      sessionId: opened.consumed.sessionId,
      expiresAt: opened.expiresAt.toISOString(),
      categories: opened.consumed.categories as ShareCategory[],
      patient: {
        firstName: opened.patient.firstName,
        diabetesType: opened.patient.diabetesType as DiabetesType,
      },
    };
  }
}
