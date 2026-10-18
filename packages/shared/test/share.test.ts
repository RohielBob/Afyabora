// L5-01, L5-03 et L5-04 : réponses de POST /shares, POST /shares/claim et GET /shares/:id/status.
import { describe, expect, it } from 'vitest';
import {
  claimShareResponseSchema,
  createShareResponseSchema,
  createShareSchema,
  shareStatusResponseSchema,
} from '../src';

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

describe('claimShareResponseSchema (L5-03)', () => {
  const claimed = {
    sessionId: '3f2b8c1e-6a4d-4e1b-9c7a-1d2e3f4a5b6c',
    expiresAt: '2026-10-07T08:30:00+01:00',
    categories: ['GLUCOSE_HISTORY', 'MEALS'],
    patient: { firstName: 'Jean', diabetesType: 'TYPE_2' },
  };

  it('accepte l’exemple du contrat', () => {
    expect(claimShareResponseSchema.parse(claimed)).toEqual(claimed);
  });

  it('ne laisse passer AUCUN autre renseignement sur le patient (nom, date de naissance…)', () => {
    const parsed = claimShareResponseSchema.parse({
      ...claimed,
      patient: { ...claimed.patient, lastName: 'Dupont', birthDate: '1990-01-01' },
    });
    expect(parsed.patient).toEqual({ firstName: 'Jean', diabetesType: 'TYPE_2' });
  });

  it.each([
    ['catégorie inconnue', { categories: ['DOSSIER_COMPLET'] }],
    ['type de diabète inconnu', { patient: { firstName: 'Jean', diabetesType: 'TYPE_3' } }],
    ['date sans fuseau', { expiresAt: '2026-10-07T08:30:00' }],
    ['identifiant qui n’est pas un UUID', { sessionId: '42' }],
  ])('refuse : %s', (_label, change) => {
    expect(claimShareResponseSchema.safeParse({ ...claimed, ...change }).success).toBe(false);
  });
});

describe('shareStatusResponseSchema (L5-04)', () => {
  const active = {
    status: 'ACTIVE',
    expiresAt: '2026-10-07T08:30:00+01:00',
    claimedAt: '2026-10-07T08:00:00+01:00',
    doctor: { firstName: 'Aline', lastName: 'Demo', institution: 'Clinique de démonstration' },
    remainingSeconds: 277,
  };

  it('accepte l’exemple du contrat, et une session encore en attente', () => {
    expect(shareStatusResponseSchema.parse(active)).toEqual(active);
    const pending = {
      status: 'PENDING',
      expiresAt: null,
      claimedAt: null,
      doctor: null,
      remainingSeconds: null,
    };
    expect(shareStatusResponseSchema.parse(pending)).toEqual(pending);
  });

  it.each([
    ['secondes négatives', { remainingSeconds: -1 }],
    ['secondes non entières', { remainingSeconds: 1.5 }],
    ['statut inconnu', { status: 'TERMINE' }],
    ['champ manquant', { doctor: undefined }],
  ])('refuse : %s', (_label, change) => {
    expect(shareStatusResponseSchema.safeParse({ ...active, ...change }).success).toBe(false);
  });
});
