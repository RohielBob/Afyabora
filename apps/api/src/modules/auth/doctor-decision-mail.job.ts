// Email « compte approuvé / refusé » au médecin. L'outil d'administration (pnpm admin:doctors) décide et
// marque le compte (`decisionEmailPending = true`) ; cette tâche, chaque minute, envoie l'email puis copie la
// décision à la boîte de l'équipe. Pourquoi pas directement dans l'outil ? Il tourne sur le poste d'un membre
// de l'équipe : il lui faudrait la clé du service d'envoi. Ainsi elle reste sur le serveur.
//
// Chaque compte est d'abord « réservé » (pending true → false, modification atomique) : avec deux passages ou
// deux serveurs en même temps, un seul envoie. Si l'envoi échoue, la marque est remise : le passage suivant
// réessaie. Si l'API hébergée dormait (offre gratuite), l'email part à son réveil.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildDoctorDecisionMail,
  buildTeamDecisionSentMail,
  type DoctorDecision,
  type DoctorSummary,
} from './doctor-review.mails';
import { findDoctorSummary, TeamNotifier } from './team-notifier';

/** Au plus autant d'emails par passage (le reste au passage suivant). */
export const DECISION_MAIL_BATCH = 20;

@Injectable()
export class DoctorDecisionMailJob {
  private readonly logger = new Logger('DoctorDecisionMail');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly team: TeamNotifier,
  ) {}

  /** Renvoie le nombre d'emails envoyés aux médecins pendant ce passage. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'doctor-decision-mail' })
  async run(): Promise<number> {
    let sent = 0;
    try {
      const pending = await this.prisma.doctorProfile.findMany({
        where: { decisionEmailPending: true },
        select: { userId: true },
        orderBy: { verifiedAt: 'asc' },
        take: DECISION_MAIL_BATCH,
      });
      for (const { userId } of pending) {
        if (await this.sendOne(userId)) sent++;
      }
    } catch (error) {
      // Base injoignable, etc. : le passage suivant reprendra. Jamais de donnée dans le journal.
      this.logger.warn(`Envoi des décisions en échec (${(error as Error)?.name ?? 'erreur'})`);
    }
    if (sent > 0) this.logger.log(`${sent} médecin(s) prévenu(s) de la décision`);
    return sent;
  }

  private async sendOne(userId: string): Promise<boolean> {
    // Réservation atomique : seul celui qui fait passer la marque de true à false envoie l'email.
    const claimed = await this.prisma.doctorProfile.updateMany({
      where: { userId, decisionEmailPending: true },
      data: { decisionEmailPending: false },
    });
    if (claimed.count !== 1) return false;

    let announced: { doctor: DoctorSummary; decision: DoctorDecision } | null;
    try {
      announced = await this.sendDecision(userId);
    } catch (error) {
      // Lecture ou envoi en échec : marque remise, nouvel essai au passage suivant (dans une minute).
      await this.prisma.doctorProfile.updateMany({
        where: { userId },
        data: { decisionEmailPending: true },
      });
      this.logger.warn(
        `Échec d'envoi d'un email de décision, nouvel essai dans une minute (${(error as Error)?.name ?? 'erreur'})`,
      );
      return false;
    }
    if (!announced) return false;
    const { doctor, decision } = announced;
    this.team.notify((to) => buildTeamDecisionSentMail(to, doctor, decision));
    return true;
  }

  /** Envoie l'email de décision ; `null` s'il n'y a plus rien à annoncer. */
  private async sendDecision(
    userId: string,
  ): Promise<{ doctor: DoctorSummary; decision: DoctorDecision } | null> {
    // Statut relu APRÈS la réservation : c'est la décision la plus récente qui est annoncée.
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true },
    });
    const doctor = await findDoctorSummary(this.prisma, userId);
    const decision = profile?.verificationStatus;
    // Revenu « en attente » entre-temps (ou compte supprimé) : plus rien à annoncer.
    if (!doctor || (decision !== 'APPROVED' && decision !== 'REJECTED')) return null;

    const replyTo = this.team.address;
    await this.mail.send({
      ...buildDoctorDecisionMail({
        to: doctor.email,
        decision,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        portalUrl: this.config.getOrThrow<string>('PORTAL_URL').replace(/\/+$/, ''),
        canReply: Boolean(replyTo),
      }),
      // L'adresse d'envoi (ex. Brevo) ne reçoit rien : une réponse du médecin arrive à l'équipe.
      ...(replyTo ? { replyTo } : {}),
    });
    return { doctor, decision };
  }
}
