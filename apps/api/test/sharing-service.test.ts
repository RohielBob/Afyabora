// L5-01 : création d'une session quand la base est saturée (sans vraie base : tourne partout).
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  BUSY_MESSAGE,
  CREATE_TRANSACTION,
  SharingService,
} from '../src/modules/sharing/sharing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const PATIENT = '3f2a1c9e-1111-4111-8111-111111111111';

/** Base simulée : profil présent ; la transaction échoue avec `error` et retient ses options. */
function service(error: unknown) {
  const seen: { options?: unknown } = {};
  const prisma = {
    patientProfile: { findUnique: async () => ({ userId: PATIENT }) },
    user: { findUnique: async () => ({ id: PATIENT }) },
    $transaction: async (_task: unknown, options: unknown) => {
      seen.options = options;
      throw error;
    },
  } as unknown as PrismaService;
  return { sharing: new SharingService(prisma), seen };
}

describe('POST /shares quand la base est saturée', () => {
  it('transaction impossible à démarrer (P2028) : 503 « réessayez », jamais une erreur 500', async () => {
    const { sharing } = service({ code: 'P2028' });
    const attempt = sharing.create(PATIENT, { categories: ['MEALS'], duration: 'MIN_5' });
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toMatchObject({ response: { message: BUSY_MESSAGE } });
  });

  it('une autre erreur n’est pas déguisée en 503', async () => {
    const { sharing } = service(new Error('panne'));
    await expect(
      sharing.create(PATIENT, { categories: ['MEALS'], duration: 'MIN_5' }),
    ).rejects.toThrow('panne');
  });

  it('la transaction attend jusqu’à 10 s une connexion (2 s par défaut)', async () => {
    const { sharing, seen } = service({ code: 'P2028' });
    await sharing
      .create(PATIENT, { categories: ['MEALS'], duration: 'MIN_5' })
      .catch(() => undefined);
    expect(seen.options).toEqual(CREATE_TRANSACTION);
    expect(CREATE_TRANSACTION.maxWait).toBe(10_000);
  });
});
