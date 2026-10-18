// Ticket L5-04 : secondes restantes, tâche planifiée en panne, base saturée (sans vraie base : tourne partout).
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareExpiryJob } from '../src/modules/sharing/share-expiry';
import {
  remainingSeconds,
  ShareLifecycleService,
} from '../src/modules/sharing/share-lifecycle.service';
import { BUSY_MESSAGE } from '../src/modules/sharing/sharing.service';
import { PrismaService } from '../src/prisma/prisma.service';

const NOW = new Date('2026-10-18T08:00:00.000Z');
const SESSION = '3f2a1c9e-2222-4222-8222-222222222222';
const PATIENT = '3f2a1c9e-1111-4111-8111-111111111111';

/** Base simulée dont chaque transaction échoue avec `error`. */
const failing = (error: unknown) =>
  ({
    $transaction: async () => {
      throw error;
    },
  }) as unknown as PrismaService;

afterEach(() => vi.restoreAllMocks());

describe('remainingSeconds', () => {
  it.each([
    [30 * 60_000, 1800],
    [1500, 2], // arrondi au-dessus : il reste encore un peu d'accès
    [1, 1],
    [0, 0],
    [-5000, 0], // jamais négatif
  ])('fin dans %i ms ⇒ %i s', (ms, seconds) => {
    expect(remainingSeconds(new Date(NOW.getTime() + ms), NOW)).toBe(seconds);
  });

  it('pas de fin (accès pas encore ouvert) ⇒ null', () => {
    expect(remainingSeconds(null, NOW)).toBeNull();
  });
});

describe('ShareExpiryJob : planification', () => {
  it('enregistrée auprès du planificateur, chaque minute', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [ShareExpiryJob, { provide: PrismaService, useValue: failing(new Error('x')) }],
    }).compile();
    await moduleRef.init();
    try {
      const job = moduleRef.get(SchedulerRegistry).getCronJob('share-expiry');
      expect(String(job.cronTime.source)).toBe('*/1 * * * *'); // chaque minute
    } finally {
      await moduleRef.close();
    }
  });
});

describe('ShareExpiryJob en panne', () => {
  it('ne plante pas le serveur : 0 session, un avertissement SANS donnée (seulement le type d’erreur)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const secret = new Error('patient 3f2a1c9e glycémie 250');
    secret.name = 'PrismaClientKnownRequestError';
    await expect(new ShareExpiryJob(failing(secret)).run(NOW)).resolves.toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('PrismaClientKnownRequestError');
    expect(message).not.toContain('3f2a1c9e');
    expect(message).not.toContain('250');
  });

  it('passage sans session échue : aucun message', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const prisma = { $transaction: async () => 0 } as unknown as PrismaService;
    await expect(new ShareExpiryJob(prisma).run(NOW)).resolves.toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('sessions expirées : le nombre seulement', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const prisma = { $transaction: async () => 3 } as unknown as PrismaService;
    await expect(new ShareExpiryJob(prisma).run(NOW)).resolves.toBe(3);
    expect(log).toHaveBeenCalledWith('3 accès expiré(s)');
  });
});

describe('révocation et état quand la base est saturée', () => {
  it('P2028 : 503 « réessayez », jamais une erreur 500', async () => {
    const lifecycle = new ShareLifecycleService(failing({ code: 'P2028' }));
    for (const attempt of [
      lifecycle.revoke(PATIENT, SESSION, () => NOW),
      lifecycle.status(PATIENT, SESSION, NOW),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(attempt).rejects.toMatchObject({ response: { message: BUSY_MESSAGE } });
    }
  });

  it('une autre erreur n’est pas déguisée en 503', async () => {
    const lifecycle = new ShareLifecycleService(failing(new Error('panne')));
    await expect(lifecycle.revoke(PATIENT, SESSION, () => NOW)).rejects.toThrow('panne');
  });
});
