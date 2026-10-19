import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RegisterDoctorInput, RegisterPatientInput } from '@glyka/shared';
import * as argon2 from 'argon2';
import { generateOpaqueToken, hashToken } from '../../common/crypto/tokens';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildVerifyEmailMail } from './auth.mails';
import { buildTeamDoctorRegisteredMail, buildTeamDoctorToReviewMail } from './doctor-review.mails';
import { findDoctorSummary, TeamNotifier } from './team-notifier';

/** Durée de validité du lien de vérification (décision L1-01, réunion du 2026-10-09). */
export const VERIFY_EMAIL_TTL_HOURS = 24;

/**
 * Réponse UNIQUE de l'inscription, que l'adresse soit nouvelle, déjà inscrite ou déjà vérifiée :
 * un inconnu ne peut pas savoir si une adresse a un compte (pas d'énumération de comptes).
 */
export const REGISTER_ACCEPTED_MESSAGE =
  "Si cette adresse est valide, un email vient d'être envoyé.";
export const EMAIL_VERIFIED_MESSAGE = 'Adresse email vérifiée. Vous pouvez vous connecter.';

type Role = 'PATIENT' | 'DOCTOR';
type DoctorDetails = Pick<
  RegisterDoctorInput,
  'firstName' | 'lastName' | 'licenseNumber' | 'institution'
>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly team: TeamNotifier,
  ) {}

  /** POST /auth/register (L1-01). */
  async registerPatient(input: RegisterPatientInput): Promise<{ message: string }> {
    await this.register(input.email, input.password, 'PATIENT');
    return { message: REGISTER_ACCEPTED_MESSAGE };
  }

  /** POST /auth/register-doctor (L1-01) : compte créé avec un profil médecin « PENDING » (approbation : L1-12). */
  async registerDoctor(input: RegisterDoctorInput): Promise<{ message: string }> {
    const { firstName, lastName, licenseNumber, institution } = input;
    await this.register(input.email, input.password, 'DOCTOR', {
      firstName,
      lastName,
      licenseNumber,
      institution,
    });
    return { message: REGISTER_ACCEPTED_MESSAGE };
  }

  /** POST /auth/verify-email (L1-01) : consomme le jeton (une seule fois) et marque l'adresse comme vérifiée. */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const now = new Date();
    const doctorToReview = await this.prisma.$transaction(async (tx) => {
      // On ne stocke que le hash : on hache le jeton reçu pour le retrouver.
      const found = await tx.emailToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, type: true, usedAt: true, expiresAt: true },
      });
      if (!found || found.type !== 'VERIFY_EMAIL' || found.usedAt || found.expiresAt <= now) {
        throw invalidVerifyToken();
      }

      // Consommation ATOMIQUE : la condition « usedAt: null » garantit qu'avec deux clics simultanés,
      // une seule requête modifie la ligne (count = 1) ; l'autre reçoit TOKEN_INVALID.
      const consumed = await tx.emailToken.updateMany({
        where: { id: found.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalidVerifyToken();

      const verified = await tx.user.updateMany({
        where: { id: found.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      // Adresse confirmée À L'INSTANT d'un médecin : son compte attend maintenant l'équipe.
      return verified.count === 1 ? findDoctorSummary(tx, found.userId) : null;
    });
    // Après la transaction (validée) : l'équipe est prévenue qu'un compte attend sa vérification.
    if (doctorToReview) this.team.notify((to) => buildTeamDoctorToReviewMail(to, doctorToReview));
    return { message: EMAIL_VERIFIED_MESSAGE };
  }

  /**
   * Inscription commune patient / médecin. Trois cas, une seule réponse :
   *  1. adresse inconnue      → création du compte + email de vérification ;
   *  2. adresse non vérifiée  → nouvel email de vérification (l'ancien lien ne marche plus) ; le mot de passe
   *                             existant n'est PAS modifié (sinon n'importe qui pourrait le changer) ;
   *  3. adresse déjà vérifiée → rien n'est fait.
   */
  private async register(
    email: string,
    password: string,
    role: Role,
    doctor?: DoctorDetails,
  ): Promise<void> {
    // Hachage fait dans TOUS les cas : le temps de réponse ne doit pas révéler si l'adresse existe.
    // argon2id = variante recommandée pour les mots de passe (CDC §6.1).
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, emailVerifiedAt: true },
    });

    if (existing) {
      if (existing.emailVerifiedAt) return; // cas 3
      await this.sendVerificationEmail(existing.id, email, existing.role === 'DOCTOR'); // cas 2
      return;
    }

    let userId: string;
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role,
          consentAt: new Date(), // le schéma Zod impose consent === true
          ...(doctor ? { doctorProfile: { create: doctor } } : {}),
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      // Deux inscriptions simultanées avec la même adresse : la base refuse la seconde (contrainte unique).
      // On répond comme si de rien n'était (même message), sans créer de doublon.
      if (isUniqueViolation(error)) return;
      throw error;
    }
    await this.sendVerificationEmail(userId, email, role === 'DOCTOR'); // cas 1
    // Nouveau compte médecin : l'équipe est prévenue (une seule fois, pas aux réinscriptions du cas 2).
    if (doctor) this.team.notify((to) => buildTeamDoctorRegisteredMail(to, { email, ...doctor }));
  }

  private async sendVerificationEmail(userId: string, email: string, isDoctor: boolean) {
    const token = generateOpaqueToken(); // 32 octets aléatoires ; seul le hash va en base
    const expiresAt = new Date(Date.now() + VERIFY_EMAIL_TTL_HOURS * 3600 * 1000);

    await this.prisma.$transaction([
      // Un seul lien valide à la fois : les anciens liens de vérification de ce compte sont supprimés.
      this.prisma.emailToken.deleteMany({ where: { userId, type: 'VERIFY_EMAIL', usedAt: null } }),
      this.prisma.emailToken.create({
        data: { userId, type: 'VERIFY_EMAIL', tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    const portalUrl = this.config.getOrThrow<string>('PORTAL_URL').replace(/\/+$/, '');
    const link = `${portalUrl}/verify-email?token=${token}`;

    // Envoi NON attendu : la réponse HTTP ne dépend ni de la lenteur ni d'une panne du serveur SMTP
    // (sinon le temps de réponse trahirait les comptes déjà vérifiés, qui ne reçoivent rien).
    // En cas d'échec, l'utilisateur peut se réinscrire pour recevoir un nouveau lien.
    void this.mail
      .send(
        buildVerifyEmailMail({
          to: email,
          link,
          validityHours: VERIFY_EMAIL_TTL_HOURS,
          isDoctor,
        }),
      )
      .catch((error: unknown) => {
        // Jamais l'adresse ni le jeton dans les logs : seulement le type d'erreur.
        this.logger.error(
          `Échec d'envoi de l'email de vérification (${error instanceof Error ? error.name : 'erreur inconnue'})`,
        );
      });
  }
}

function invalidVerifyToken(): BadRequestException {
  return new BadRequestException({
    message: 'Lien de vérification invalide ou expiré.',
    code: 'TOKEN_INVALID',
  });
}

/** Erreur Prisma P2002 = violation d'une contrainte d'unicité (ici : email déjà pris). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
