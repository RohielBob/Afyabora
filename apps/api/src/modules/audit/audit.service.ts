// Journal d'accès du patient (L5-05) : écriture (access-log.ts) et lecture (« Qui a consulté mes données »).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessAction, AccessLogList, AccessLogQuery } from '@glyka/shared';
import { afterCursor, decodeCursor, encodeCursor } from '../../common/data/owned-records';
import { PrismaService } from '../../prisma/prisma.service';
import { writeAccessLog, type AccessLogInput } from './access-log';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Écrit des lignes du journal. Passer la transaction de l'évènement (`client`) pour que l'évènement et sa
   * trace réussissent ou échouent ensemble ; sans transaction, la ligne est écrite seule.
   */
  record(entries: AccessLogInput[], client: Prisma.TransactionClient = this.prisma): Promise<void> {
    return writeAccessLog(client, entries);
  }

  /**
   * GET /shares/log : le journal du patient, du plus récent au plus ancien, par pages (curseur). Pour chaque
   * ligne : l'action, l'heure, la session et le NOM du médecin (jamais son adresse IP ni son identifiant).
   */
  async list(patientId: string, query: AccessLogQuery): Promise<AccessLogList> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.accessLog.findMany({
      where: { patientId, ...(after ? afterCursor('at', after) : {}) },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: { id: true, action: true, at: true, sessionId: true, actorId: true },
    });
    const page = rows.slice(0, query.limit);
    const names = await this.doctorNames(page.map((row) => row.actorId));
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action as AccessAction,
        at: row.at.toISOString(),
        sessionId: row.sessionId,
        actorName: (row.actorId && names.get(row.actorId)) ?? null,
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.at, last.id) : null,
    };
  }

  /** Noms des médecins (une seule requête par page). Compte médecin supprimé : pas de nom. */
  private async doctorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const doctors = await this.prisma.doctorProfile.findMany({
      where: { userId: { in: wanted } },
      select: { userId: true, firstName: true, lastName: true },
    });
    return new Map(doctors.map((d) => [d.userId, `${d.firstName} ${d.lastName}`]));
  }
}
