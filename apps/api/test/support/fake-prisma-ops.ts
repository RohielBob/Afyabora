// Petits morceaux de « fausse base » partagés par les tests d'authentification (L1-13).
// Ils imitent les opérations Prisma utilisées par SessionService pour compter les échecs de connexion
// de façon ATOMIQUE (updateMany avec condition sur updatedAt, `increment`) et pour compter les jetons
// révoqués d'une famille (`count`). Comme en base, chaque appel s'applique en une fois, sans attente
// au milieu : deux requêtes simultanées ne peuvent pas lire puis écrire la même ancienne valeur.

type DateFilter = { gt?: Date; lte?: Date };
type Increment = { increment: number };

interface UserLike {
  id: string;
  failedLogins: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}

function matchesDate(value: Date, filter: DateFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.gt && !(value > filter.gt)) return false;
  if (filter.lte && !(value <= filter.lte)) return false;
  return true;
}

/** prisma.user.updateMany({ where: { id, updatedAt? }, data: { failedLogins?, lockedUntil?, updatedAt? } }) */
export function userUpdateMany<U extends UserLike>(
  rows: U[],
  args: {
    where: { id: string; updatedAt?: DateFilter };
    data: {
      failedLogins?: number | Increment;
      lockedUntil?: Date | null;
      updatedAt?: Date;
    };
  },
): { count: number } {
  const targets = rows.filter(
    (u) => u.id === args.where.id && matchesDate(u.updatedAt, args.where.updatedAt),
  );
  for (const u of targets) {
    const { failedLogins, lockedUntil, updatedAt } = args.data;
    if (typeof failedLogins === 'number') u.failedLogins = failedLogins;
    else if (failedLogins) u.failedLogins += failedLogins.increment;
    if (lockedUntil !== undefined) u.lockedUntil = lockedUntil;
    u.updatedAt = updatedAt ?? new Date(); // comme @updatedAt de Prisma
  }
  return { count: targets.length };
}

interface RefreshLike {
  familyId: string;
  revokedAt: Date | null;
}

/** prisma.refreshToken.count({ where: { familyId, revokedAt: { not: null } } }) */
export function refreshCount<R extends RefreshLike>(
  rows: R[],
  args: { where: { familyId: string; revokedAt?: { not: null } } },
): number {
  return rows.filter(
    (r) =>
      r.familyId === args.where.familyId &&
      (args.where.revokedAt === undefined || r.revokedAt !== null),
  ).length;
}
