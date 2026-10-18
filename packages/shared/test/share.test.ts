// L5-01 : réponse de POST /shares, vérifiable par l'application du patient (forme du contrat).
import { describe, expect, it } from 'vitest';
import { createShareResponseSchema, createShareSchema } from '../src';

const response = {
  session: {
    id: '3f2a1c9e-1111-4111-8111-111111111111',
    status: 'PENDING',
    categories: ['GLUCOSE_HISTORY', 'MEALS'],
    duration: 'MIN_5',
    createdAt: '2026-10-18T08:00:00.000Z',
    claimedAt: null,
    expiresAt: null,
    revokedAt: null,
    doctor: null,
  },
  token: {
    token: 'k3Zt9Qw2Vx7LpR4mNc8YbH1sDfG6jAe5UoI0TyXvWzE',
    expiresAt: '2026-10-18T08:01:00.000Z',
  },
};

describe('createShareResponseSchema', () => {
  it('accepte la réponse du contrat (session en attente, sans médecin)', () => {
    expect(createShareResponseSchema.parse(response)).toEqual(response);
  });

  it('refuse un jeton trop court (moins de 32 octets) ou un statut inconnu', () => {
    expect(
      createShareResponseSchema.safeParse({
        ...response,
        token: { ...response.token, token: 'court' },
      }).success,
    ).toBe(false);
    expect(
      createShareResponseSchema.safeParse({
        ...response,
        session: { ...response.session, status: 'OUVERT' },
      }).success,
    ).toBe(false);
  });

  it('médecin présent après le scan : identité seulement', () => {
    const doctor = {
      firstName: 'Aline',
      lastName: 'Demo',
      institution: 'Clinique de démonstration',
    };
    expect(
      createShareResponseSchema.parse({ ...response, session: { ...response.session, doctor } })
        .session.doctor,
    ).toEqual(doctor);
  });
});

describe('createShareSchema', () => {
  it('au moins une catégorie, sans doublon, et une durée connue', () => {
    expect(createShareSchema.safeParse({ categories: ['MEALS'], duration: 'HOUR_1' }).success).toBe(
      true,
    );
    expect(createShareSchema.safeParse({ categories: [], duration: 'HOUR_1' }).success).toBe(false);
    expect(
      createShareSchema.safeParse({ categories: ['MEALS', 'MEALS'], duration: 'HOUR_1' }).success,
    ).toBe(false);
    expect(createShareSchema.safeParse({ categories: ['MEALS'], duration: 'JOUR' }).success).toBe(
      false,
    );
  });
});
