// Sessions (ticket L1-02) : connexion, rafraîchissement rotatif, déconnexion, verrouillage après 5 échecs.
//
// Deux jetons (CDC §6.1) :
//  - jeton d'ACCÈS : JWT signé, valable 15 min, envoyé à chaque requête (« Authorization: Bearer … »).
//    Il n'est pas stocké : le serveur vérifie seulement sa signature (JwtAuthGuard).
//  - jeton de RAFRAÎCHISSEMENT : aléatoire et opaque, valable 30 jours, sert UNE fois à obtenir une nouvelle paire.
//    Seul son hash SHA-256 est stocké (table RefreshToken). Tous les jetons issus d'une même connexion
//    partagent un « familyId » : si un ancien jeton est réutilisé (signe de vol), toute la famille est révoquée.
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  type DoctorVerificationStatus,
  type LoginInput,
  type UserRole,
} from '@glyka/shared';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashToken } from '../../common/crypto/tokens';
import { PrismaService } from '../../prisma/prisma.service';

/** Message UNIQUE pour « email inconnu » et « mauvais mot de passe » : on ne révèle pas qui a un compte. */
export const INVALID_CREDENTIALS_MESSAGE = 'Email ou mot de passe incorrect.';
export const INVALID_SESSION_MESSAGE = 'Session invalide ou expirée. Reconnectez-vous.';

/** Fenêtre de comptage des échecs : 5 échecs « en 10 minutes » (CDC F1). */
const FAILURE_WINDOW_MS = LOGIN_LOCK_MINUTES * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface LoginResponse extends AuthTokens {
  user: {
    id: string;
    role: UserRole;
    /** Faux pour un patient sans profil médical : le mobile lance l'assistant de profil (L1-05). */
    profileCompleted: boolean;
    doctorVerificationStatus: DoctorVerificationStatus | null;
  };
}

@Injectable()
export class SessionService {
  /**
   * Hash argon2id d'un mot de passe quelconque, calculé une fois au démarrage.
   * Sert pour un email inconnu : on fait le même calcul coûteux que pour un vrai compte,
   * afin que le temps de réponse ne révèle pas si l'adresse existe.
   */
  private readonly dummyHash = argon2.hash(generateOpaqueToken(), { type: argon2.argon2id });

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** POST /auth/login */
  async login({ email, password }: LoginInput): Promise<LoginResponse> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        failedLogins: true,
        lockedUntil: true,
        updatedAt: true,
        patientProfile: { select: { userId: true } },
        doctorProfile: { select: { verificationStatus: true } },
      },
    });

    if (!user) {
      await argon2.verify(await this.dummyHash, password); // même durée qu'un vrai essai
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS_MESSAGE });
    }

    // Compte verrouillé : on refuse SANS vérifier le mot de passe (sinon un attaquant pourrait continuer à deviner).
    if (user.lockedUntil && user.lockedUntil > now) {
      throw accountLocked(user.lockedUntil, now);
    }

    if (!(await argon2.verify(user.passwordHash, password))) {
      await this.recordFailure(user, now);
    }

    // Mot de passe correct. L'email non vérifié n'est signalé qu'APRÈS le bon mot de passe :
    // un inconnu ne peut donc pas s'en servir pour savoir si une adresse est inscrite.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'Adresse email non vérifiée. Ouvrez le lien reçu par email.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Connexion réussie : on efface les échecs passés et un éventuel verrouillage terminé.
    if (user.failedLogins !== 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null },
      });
    }

    const tokens = await this.issueTokens(user.id, user.role, randomUUID());
    return {
      ...tokens,
      user: {
        id: user.id,
        role: user.role,
        profileCompleted: user.role === 'PATIENT' ? user.patientProfile !== null : true,
        doctorVerificationStatus: user.doctorProfile?.verificationStatus ?? null,
      },
    };
  }

  /** POST /auth/refresh : échange un jeton de rafraîchissement contre une nouvelle paire (rotation). */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = new Date();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        rotatedAt: true,
        revokedAt: true,
        user: { select: { role: true } },
      },
    });
    if (!stored) throw invalidSession();

    // Jeton déjà utilisé ou révoqué présenté à nouveau : quelqu'un a peut-être copié la session.
    // On révoque TOUTE la famille : le voleur ET l'utilisateur légitime devront se reconnecter.
    if (stored.rotatedAt || stored.revokedAt) {
      await this.revokeFamily(stored.familyId, now);
      throw invalidSession();
    }
    if (stored.expiresAt <= now) throw invalidSession();

    // Consommation ATOMIQUE : avec deux requêtes simultanées, une seule passe ;
    // l'autre est traitée comme une réutilisation.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now },
    });
    if (consumed.count !== 1) {
      await this.revokeFamily(stored.familyId, now);
      throw invalidSession();
    }

    return this.issueTokens(stored.userId, stored.user.role, stored.familyId);
  }

  /**
   * POST /auth/logout : révoque la session (toute la famille du jeton fourni).
   * Propriété vérifiée : on ne peut fermer que SA session ; un jeton inconnu, déjà révoqué ou appartenant
   * à quelqu'un d'autre ne change rien, et la réponse reste 204 (idempotent, rien n'est révélé).
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { userId: true, familyId: true },
    });
    if (!stored || stored.userId !== userId) return;
    await this.revokeFamily(stored.familyId, new Date());
  }

  /** Échec de mot de passe : compte les échecs sur 10 minutes ; au 5e, verrouille 10 minutes. */
  private async recordFailure(
    user: { id: string; failedLogins: number; updatedAt: Date },
    now: Date,
  ): Promise<never> {
    // Pas de colonne « date du 1er échec » dans le schéma : on utilise updatedAt (mis à jour à chaque échec).
    // Dernier échec il y a plus de 10 minutes → le compteur repart de 1.
    const recent = now.getTime() - user.updatedAt.getTime() < FAILURE_WINDOW_MS;
    const failures = (recent ? user.failedLogins : 0) + 1;

    if (failures >= LOGIN_MAX_FAILURES) {
      const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60 * 1000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil },
      });
      throw accountLocked(lockedUntil, now);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failures },
    });
    throw new UnauthorizedException({ message: INVALID_CREDENTIALS_MESSAGE });
  }

  private async issueTokens(userId: string, role: UserRole, familyId: string): Promise<AuthTokens> {
    const accessTtl = Number(this.config.get('ACCESS_TOKEN_TTL_SECONDS') ?? 900);
    const refreshTtlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);

    // Contenu du JWT : identifiant et rôle seulement (lus par JwtAuthGuard puis RolesGuard). Aucune donnée de santé.
    const accessToken = await this.jwt.signAsync({ sub: userId, role }, { expiresIn: accessTtl });

    const refreshToken = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 3600 * 1000),
      },
    });
    return { accessToken, refreshToken, expiresInSeconds: accessTtl };
  }

  private revokeFamily(familyId: string, now: Date) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException({ message: INVALID_SESSION_MESSAGE, code: 'TOKEN_INVALID' });
}

function accountLocked(lockedUntil: Date, now: Date): HttpException {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  return new HttpException(
    {
      message: 'Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.',
      code: 'ACCOUNT_LOCKED',
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
