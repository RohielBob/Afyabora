// Mot de passe oublié (ticket L1-03) : demande d'un lien par email, puis choix d'un nouveau mot de passe.
// Même principe que la vérification d'email (L1-01) : jeton opaque, seul son hash est stocké, usage unique.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { generateOpaqueToken, hashToken } from '../../common/crypto/tokens';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildResetPasswordMail } from './auth.mails';
import { buildTeamDoctorToReviewMail } from './doctor-review.mails';
import { findDoctorSummary, TeamNotifier } from './team-notifier';

/** Lien de réinitialisation valable 1 heure : court, car il donne accès au compte. */
export const RESET_PASSWORD_TTL_MINUTES = 60;

/** Réponse UNIQUE, que le compte existe ou non (pas d'énumération de comptes). */
export const FORGOT_PASSWORD_MESSAGE =
  'Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.';
export const PASSWORD_RESET_MESSAGE =
  'Mot de passe modifié. Vous pouvez vous connecter avec votre nouveau mot de passe.';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly team: TeamNotifier,
  ) {}

  /** POST /auth/forgot-password : envoie un lien si le compte existe ; sinon ne fait rien. Réponse identique. */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return { message: FORGOT_PASSWORD_MESSAGE };

    const token = generateOpaqueToken(); // 32 octets aléatoires ; seul le hash va en base
    const expiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_MINUTES * 60 * 1000);
    await this.prisma.$transaction([
      // Un seul lien valide à la fois : une nouvelle demande annule les liens précédents.
      this.prisma.emailToken.deleteMany({
        where: { userId: user.id, type: 'RESET_PASSWORD', usedAt: null },
      }),
      this.prisma.emailToken.create({
        data: { userId: user.id, type: 'RESET_PASSWORD', tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    const portalUrl = this.config.getOrThrow<string>('PORTAL_URL').replace(/\/+$/, '');
    // Envoi NON attendu : la durée de la réponse ne doit pas révéler si le compte existe.
    void this.mail
      .send(
        buildResetPasswordMail({
          to: email,
          link: `${portalUrl}/reset-password?token=${token}`,
          validityMinutes: RESET_PASSWORD_TTL_MINUTES,
        }),
      )
      .catch((error: unknown) => {
        // Jamais l'adresse ni le jeton dans les logs.
        this.logger.error(
          `Échec d'envoi de l'email de réinitialisation (${error instanceof Error ? error.name : 'erreur inconnue'})`,
        );
      });

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  /**
   * POST /auth/reset-password : consomme le jeton, enregistre le nouveau mot de passe et ferme TOUTES les sessions.
   * Recevoir le lien prouve que la personne lit cette boîte mail : l'adresse est donc aussi marquée vérifiée
   * (sinon un compte jamais vérifié dont on a oublié le mot de passe resterait bloqué).
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Hachage AVANT la transaction : argon2 est volontairement lent, on ne garde pas la base en attente.
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const now = new Date();

    const doctorToReview = await this.prisma.$transaction(async (tx) => {
      const found = await tx.emailToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, type: true, usedAt: true, expiresAt: true },
      });
      if (!found || found.type !== 'RESET_PASSWORD' || found.usedAt || found.expiresAt <= now) {
        throw invalidResetToken();
      }

      // Consommation ATOMIQUE : deux envois simultanés du même lien → un seul réussit.
      const consumed = await tx.emailToken.updateMany({
        where: { id: found.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalidResetToken();

      const user = await tx.user.findUnique({
        where: { id: found.userId },
        select: { emailVerifiedAt: true },
      });
      await tx.user.update({
        where: { id: found.userId },
        data: {
          passwordHash,
          failedLogins: 0, // un verrouillage en cours est levé : le propriétaire a prouvé son identité
          lockedUntil: null,
          emailVerifiedAt: user?.emailVerifiedAt ?? now,
        },
      });

      // Toutes les sessions existantes sont fermées (contrat) : si le mot de passe avait fuité,
      // la personne qui l'utilisait est déconnectée au prochain rafraîchissement.
      await tx.refreshToken.updateMany({
        where: { userId: found.userId, revokedAt: null },
        data: { revokedAt: now },
      });

      // Adresse confirmée par ce lien (compte jamais vérifié) d'un médecin : comme après verify-email,
      // son compte attend maintenant la vérification de l'équipe.
      return user && !user.emailVerifiedAt ? findDoctorSummary(tx, found.userId) : null;
    });
    if (doctorToReview) this.team.notify((to) => buildTeamDoctorToReviewMail(to, doctorToReview));

    return { message: PASSWORD_RESET_MESSAGE };
  }
}

function invalidResetToken(): BadRequestException {
  return new BadRequestException({
    message: 'Lien de réinitialisation invalide ou expiré. Refaites une demande.',
    code: 'TOKEN_INVALID',
  });
}
