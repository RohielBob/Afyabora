// Partage avec un médecin par QR dynamique (lot L5, CDC F7, ADR-0003). Ce fichier grandit ticket après
// ticket (voir le README du module).
//
// L5-01 : POST /shares. Le patient choisit les catégories partagées et la durée de l'accès ; le serveur crée
// une session EN ATTENTE de scan et son premier jeton (le contenu du QR).
//  - La durée de l'accès ne démarre pas ici : elle démarre au scan par le médecin (L5-03), donc `claimedAt`
//    et `expiresAt` restent vides tant que la session attend.
//  - Une nouvelle session REMPLACE les sessions encore en attente du même patient : elles passent à
//    EXPIRED et leurs jetons ne servent plus. Un ancien QR (ex. photographié, ou resté sur un autre écran)
//    ne peut donc plus ouvrir d'accès. Les sessions déjà ouvertes par un médecin (ACTIVE) ne sont pas
//    touchées : le patient les arrête lui-même (révocation, L5-04).
//  - Session et jeton sont écrits dans UNE transaction : jamais de session sans QR, ni de QR orphelin.
//  - Deux créations SIMULTANÉES du même patient (double appui) passent l'une après l'autre grâce à un
//    verrou PostgreSQL propre à ce patient (pg_advisory_xact_lock, libéré à la fin de la transaction) :
//    il ne reste jamais qu'UNE session en attente. Les patients différents ne s'attendent pas.
//    Une transaction qui attend son tour garde une connexion à la base : on lui laisse 10 s pour démarrer
//    (2 s par défaut). Si la base est vraiment saturée, réponse 503 « réessayez », jamais une erreur 500.
//  - Le jeton n'est jamais enregistré ni journalisé : seul son hash l'est (share-token.ts).
//
// L5-02 : GET /shares/:id/token. Tant que la session attend son scan, l'application du patient demande un
// nouveau jeton (le QR change toutes les 60 s).
//  - Seul le patient propriétaire l'obtient : la session d'un autre patient est « introuvable » (404), sans
//    révéler qu'elle existe. Session plus en attente (scannée, expirée, révoquée) : 409 SESSION_NOT_PENDING.
//    Un QR déjà consommé suffit : la session n'attend plus de scan, même avant que l'accès soit ouvert.
//  - Le nouveau jeton REMPLACE les précédents : ils expirent immédiatement. Il n'y a jamais qu'UN QR valable
//    par session ; une photo de l'écran d'il y a 30 s ne sert plus.
//  - La ligne de la session est verrouillée (SELECT … FOR UPDATE), comme lors d'un scan (consume-token.ts) :
//    une rotation et un scan simultanés passent l'un après l'autre. Rotations simultanées (deux écrans
//    ouverts) : à la fin, un seul jeton reste valable.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CreateShareInput,
  CreateShareResponse,
  ShareCategory,
  ShareDuration,
  ShareSessionDto,
  ShareStatus,
  ShareTokenDto,
} from '@glyka/shared';
import { hasPrismaCode, notFound } from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { issueShareToken } from './share-token';

/** Ligne ShareSession telle que lue, avec le médecin éventuel (identité seulement). */
interface SessionRow {
  id: string;
  status: ShareStatus;
  categories: string[];
  duration: string;
  createdAt: Date;
  claimedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  claimedByDoctor: { firstName: string; lastName: string; institution: string } | null;
}

/** Session ⇒ forme du contrat (ShareSession). Le médecin n'apparaît qu'après son scan. */
export function toShareSessionDto(row: SessionRow): ShareSessionDto {
  return {
    id: row.id,
    status: row.status,
    categories: row.categories as ShareCategory[],
    duration: row.duration as ShareDuration,
    createdAt: row.createdAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    doctor: row.claimedByDoctor
      ? {
          firstName: row.claimedByDoctor.firstName,
          lastName: row.claimedByDoctor.lastName,
          institution: row.claimedByDoctor.institution,
        }
      : null,
  };
}

/** Attente maximale d'une connexion (au lieu de 2 s) et durée maximale de la transaction (L5-01). */
export const CREATE_TRANSACTION = { maxWait: 10_000, timeout: 15_000 } as const;

export const BUSY_MESSAGE = 'Le partage est momentanément indisponible. Réessayez dans un instant.';

export const SESSION_NOT_FOUND_MESSAGE = 'Session de partage introuvable.';
export const NOT_PENDING_MESSAGE =
  "Ce partage n'attend plus de scan : il a déjà été ouvert, a expiré ou a été arrêté.";

/** P2028 (base saturée) ⇒ 503 « réessayez » ; toute autre erreur passe telle quelle. */
export function busyAsUnavailable(error: unknown): never {
  if (hasPrismaCode(error, 'P2028'))
    throw new ServiceUnavailableException({ message: BUSY_MESSAGE });
  throw error;
}

const SESSION_SELECT = {
  id: true,
  status: true,
  categories: true,
  duration: true,
  createdAt: true,
  claimedAt: true,
  expiresAt: true,
  revokedAt: true,
  claimedByDoctor: { select: { firstName: true, lastName: true, institution: true } },
} as const;

@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /shares (L5-01) : session en attente de scan + premier jeton. */
  async create(
    patientId: string,
    input: CreateShareInput,
    now = new Date(),
  ): Promise<CreateShareResponse> {
    await this.requireProfile(patientId);
    const issued = issueShareToken(now);
    const session = await this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${patientId}::text, 0))) AS l`;
        // Sessions encore en attente de ce patient : remplacées (leur QR ne sert plus).
        const waiting = await tx.shareSession.findMany({
          where: { patientId, status: 'PENDING' },
          select: { id: true },
        });
        if (waiting.length > 0) {
          const ids = waiting.map((s) => s.id);
          await tx.shareSession.updateMany({
            where: { id: { in: ids }, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          });
          await tx.shareToken.updateMany({
            where: { sessionId: { in: ids }, usedAt: null, expiresAt: { gt: now } },
            data: { expiresAt: now },
          });
        }
        return tx.shareSession.create({
          data: {
            patientId,
            // Ordre stable, quel que soit l'ordre des cases cochées dans l'application.
            categories: [...input.categories].sort(),
            duration: input.duration,
            createdAt: now,
            tokens: { create: { tokenHash: issued.tokenHash, expiresAt: issued.expiresAt } },
          },
          select: SESSION_SELECT,
        });
      }, CREATE_TRANSACTION)
      .catch(busyAsUnavailable);
    return {
      session: toShareSessionDto(session as SessionRow),
      token: { token: issued.token, expiresAt: issued.expiresAt.toISOString() },
    };
  }

  /** GET /shares/:id/token (L5-02) : nouveau jeton de la session en attente ; les précédents expirent. */
  async rotate(patientId: string, sessionId: string, now = new Date()): Promise<ShareTokenDto> {
    const issued = issueShareToken(now);
    await this.prisma
      .$transaction(async (tx) => {
        const [session] = await tx.$queryRaw<{ patientId: string; status: string }[]>`
          SELECT "patientId", "status"::text AS "status"
          FROM "ShareSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
        if (!session || session.patientId !== patientId) {
          throw notFound(SESSION_NOT_FOUND_MESSAGE);
        }
        const consumed = await tx.shareToken.count({
          where: { sessionId, usedAt: { not: null } },
        });
        if (session.status !== 'PENDING' || consumed > 0) {
          throw new ConflictException({
            message: NOT_PENDING_MESSAGE,
            code: 'SESSION_NOT_PENDING',
          });
        }
        await tx.shareToken.updateMany({
          where: { sessionId, usedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        });
        await tx.shareToken.create({
          data: { sessionId, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt },
        });
      }, CREATE_TRANSACTION)
      .catch(busyAsUnavailable);
    return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
  }

  /** Sans profil médical, pas de partage : compte supprimé ⇒ 401, sinon 400 explicite. */
  private async requireProfile(patientId: string): Promise<void> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: { userId: true },
    });
    if (profile) return;
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    throw new BadRequestException({
      message: 'Complétez votre profil médical avant de partager vos données.',
    });
  }
}
