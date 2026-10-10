// Accès à la base pour l'administration des comptes médecins (L1-12), avec Prisma.
// L'outil (doctors-cli.ts) ne dépend que de l'interface `DoctorStore` : les tests utilisent un faux.
import type { PrismaClient } from '@prisma/client';
import type { DoctorAccount, DoctorStatus } from './doctors.ts';

/** Ce qui a été fermé en refusant un compte (affiché à l'administrateur). */
export interface RejectEffects {
  /** Sessions de connexion révoquées (jetons de rafraîchissement). */
  revokedSessions: number;
  /** Partages patient en cours arrêtés (statut ACTIVE → REVOKED). */
  endedShares: number;
}

export interface DoctorStore {
  list(status: DoctorStatus | 'ALL'): Promise<DoctorAccount[]>;
  find(email: string): Promise<DoctorAccount | null>;
  approve(userId: string, now: Date): Promise<void>;
  reject(userId: string, now: Date): Promise<RejectEffects>;
}

const SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  licenseNumber: true,
  institution: true,
  verificationStatus: true,
  verifiedAt: true,
  createdAt: true,
  user: { select: { email: true, emailVerifiedAt: true } },
} as const;

type Row = {
  userId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  institution: string;
  verificationStatus: DoctorStatus;
  verifiedAt: Date | null;
  createdAt: Date;
  user: { email: string; emailVerifiedAt: Date | null };
};

function toAccount(row: Row): DoctorAccount {
  return {
    userId: row.userId,
    email: row.user.email,
    firstName: row.firstName,
    lastName: row.lastName,
    licenseNumber: row.licenseNumber,
    institution: row.institution,
    status: row.verificationStatus,
    emailVerifiedAt: row.user.emailVerifiedAt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
  };
}

export function prismaDoctorStore(prisma: PrismaClient): DoctorStore {
  return {
    async list(status) {
      const rows = await prisma.doctorProfile.findMany({
        where: status === 'ALL' ? {} : { verificationStatus: status },
        orderBy: { createdAt: 'asc' }, // les plus anciennes demandes d'abord
        select: SELECT,
      });
      return rows.map(toAccount);
    },

    async find(email) {
      const row = await prisma.doctorProfile.findFirst({
        where: { user: { email: email.toLowerCase() } },
        select: SELECT,
      });
      return row ? toAccount(row) : null;
    },

    async approve(userId, now) {
      await prisma.doctorProfile.update({
        where: { userId },
        data: { verificationStatus: 'APPROVED', verifiedAt: now },
      });
    },

    // Refus : statut, sessions de connexion et partages en cours, dans UNE transaction (tout ou rien).
    async reject(userId, now) {
      const [, sessions, shares] = await prisma.$transaction([
        prisma.doctorProfile.update({
          where: { userId },
          data: { verificationStatus: 'REJECTED', verifiedAt: now },
        }),
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.shareSession.updateMany({
          where: { claimedByDoctorId: userId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now },
        }),
      ]);
      return { revokedSessions: sessions.count, endedShares: shares.count };
    },
  };
}
