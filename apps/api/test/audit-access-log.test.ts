// Ticket L5-05 : écriture du journal d'accès (access-log.ts) et AuditService.record, sans base : tourne partout.
import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { writeAccessLog } from '../src/modules/audit/access-log';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const AT = new Date('2026-10-18T08:00:00.000Z');
const PATIENT = '3f2a1c9e-1111-4111-8111-111111111111';
const DOCTOR = '3f2a1c9e-2222-4222-8222-222222222222';
const SESSION = '3f2a1c9e-3333-4333-8333-333333333333';

/** Client simulé qui retient ce qu'on lui demande d'écrire. */
function recorder() {
  const calls: unknown[] = [];
  const client = {
    accessLog: {
      createMany: async (args: unknown) => {
        calls.push(args);
        return { count: 0 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { client, calls };
}

describe('writeAccessLog', () => {
  it('écrit exactement les champs du journal (rien d’autre), avec le client fourni', async () => {
    const { client, calls } = recorder();
    await writeAccessLog(client, [
      {
        patientId: PATIENT,
        actorId: DOCTOR,
        sessionId: SESSION,
        action: 'SHARE_CLAIMED',
        ip: '10.0.0.1',
        at: AT,
      },
    ]);
    expect(calls).toEqual([
      {
        data: [
          {
            patientId: PATIENT,
            action: 'SHARE_CLAIMED',
            at: AT,
            actorId: DOCTOR,
            sessionId: SESSION,
            ip: '10.0.0.1',
          },
        ],
      },
    ]);
  });

  it('accès d’urgence anonyme : médecin, session et IP absents ⇒ null (jamais undefined)', async () => {
    const { client, calls } = recorder();
    await writeAccessLog(client, [{ patientId: PATIENT, action: 'EMERGENCY_VIEWED', at: AT }]);
    expect(calls).toEqual([
      {
        data: [
          {
            patientId: PATIENT,
            action: 'EMERGENCY_VIEWED',
            at: AT,
            actorId: null,
            sessionId: null,
            ip: null,
          },
        ],
      },
    ]);
  });

  it('plusieurs lignes en une écriture ; aucune ligne ⇒ aucune écriture', async () => {
    const { client, calls } = recorder();
    await writeAccessLog(client, []);
    expect(calls).toHaveLength(0);
    await writeAccessLog(client, [
      { patientId: PATIENT, action: 'SHARE_EXPIRED', at: AT },
      { patientId: PATIENT, action: 'SHARE_EXPIRED', at: AT },
    ]);
    expect((calls[0] as { data: unknown[] }).data).toHaveLength(2);
  });
});

describe('AuditService.record', () => {
  it('sans transaction : écrit avec le client principal', async () => {
    const { client, calls } = recorder();
    await new AuditService(client as unknown as PrismaService).record([
      { patientId: PATIENT, action: 'REPORT_DOWNLOADED', at: AT },
    ]);
    expect(calls).toHaveLength(1);
  });

  it('avec la transaction de l’évènement : écrit avec ELLE, pas avec le client principal', async () => {
    const main = recorder();
    const tx = recorder();
    await new AuditService(main.client as unknown as PrismaService).record(
      [{ patientId: PATIENT, action: 'SHARE_VIEWED', at: AT }],
      tx.client,
    );
    expect(main.calls).toHaveLength(0);
    expect(tx.calls).toHaveLength(1);
  });
});

describe('AuditService.list', () => {
  it('page sans médecin (accès d’urgence) : aucune requête inutile pour chercher des noms', async () => {
    let doctorQueries = 0;
    const prisma = {
      accessLog: {
        findMany: async () => [
          { id: SESSION, action: 'EMERGENCY_VIEWED', at: AT, sessionId: null, actorId: null },
        ],
      },
      doctorProfile: {
        findMany: async () => {
          doctorQueries++;
          return [];
        },
      },
    } as unknown as PrismaService;
    const page = await new AuditService(prisma).list(PATIENT, { limit: 10 });
    expect(page.items[0]?.actorName).toBeNull();
    expect(doctorQueries).toBe(0);
  });
});
