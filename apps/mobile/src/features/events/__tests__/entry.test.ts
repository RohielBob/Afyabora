// Ticket L2-10 : logique de l'ajout rapide d'un événement (sans interface).
import { createLifeEventSchema } from '@glyka/shared';
import { initialWhen } from '@/features/measurements';
import {
  parseDuration,
  parseEventType,
  toCreateEventInput,
  validateEvent,
  type EventDraft,
} from '../entry';

// 10 octobre 2026, 09:17:42, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17, 42);

const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  type: 'MEAL',
  label: 'Déjeuner',
  details: '',
  duration: '',
  when: initialWhen(NOW),
  ...overrides,
});

describe('durée d’une activité', () => {
  it('vide = pas de durée ; entier de 1 à 1440 minutes ; sinon illisible', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('  ')).toBeUndefined();
    expect(parseDuration('30')).toBe(30);
    expect(parseDuration('1440')).toBe(1440);
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('1441')).toBeNull();
    expect(parseDuration('20,5')).toBeNull();
    expect(parseDuration('une heure')).toBeNull();
  });
});

describe('formulaire', () => {
  it('complet : aucune erreur', () => {
    expect(validateEvent(draft(), NOW)).toEqual({});
  });

  it('erreurs par champ (clés de traduction)', () => {
    expect(
      validateEvent(
        draft({
          type: null,
          label: '   ',
          when: { preset: 'custom', day: 0, hour: 23, minute: 0 },
        }),
        NOW,
      ),
    ).toEqual({
      type: 'event.problem.type',
      label: 'event.problem.label',
      when: 'event.problem.future',
    });
    expect(validateEvent(draft({ label: 'x'.repeat(121) }), NOW).label).toBe(
      'event.problem.labelTooLong',
    );
  });

  it('durée illisible : erreur seulement pour une activité', () => {
    expect(validateEvent(draft({ type: 'ACTIVITY', duration: 'abc' }), NOW)).toEqual({
      duration: 'event.problem.duration',
    });
    expect(validateEvent(draft({ type: 'MEAL', duration: 'abc' }), NOW)).toEqual({});
  });
});

describe('données écrites sur le téléphone', () => {
  it('repas : libellé et détails sans espaces superflus, date ISO, sans durée', () => {
    const input = toCreateEventInput(
      draft({ label: '  Déjeuner ', details: ' fufu, pondu ', duration: '30' }),
      NOW,
    );
    expect(input).toEqual({
      type: 'MEAL',
      occurredAt: new Date(2026, 9, 10, 9, 17, 0).toISOString(),
      label: 'Déjeuner',
      details: 'fufu, pondu',
    });
  });

  it('activité avec durée ; traitement déclaré sans durée ni dose calculée', () => {
    expect(
      toCreateEventInput(draft({ type: 'ACTIVITY', label: 'Marche', duration: '45' }), NOW),
    ).toMatchObject({ type: 'ACTIVITY', label: 'Marche', durationMinutes: 45 });
    const treatment = toCreateEventInput(
      draft({ type: 'TREATMENT', label: 'Insuline lente', details: 'comme d’habitude' }),
      NOW,
    );
    expect(treatment).toEqual({
      type: 'TREATMENT',
      occurredAt: expect.any(String),
      label: 'Insuline lente',
      details: 'comme d’habitude',
    });
  });

  it('toujours valide pour le schéma partagé (donc pour le serveur)', () => {
    const input = toCreateEventInput(
      draft({ type: 'ACTIVITY', label: 'Vélo', duration: '60' }),
      NOW,
    );
    expect(
      createLifeEventSchema.safeParse({ ...input, id: '11111111-1111-4111-8111-111111111111' })
        .success,
    ).toBe(true);
  });

  it('refuse de construire une saisie incomplète', () => {
    expect(() => toCreateEventInput(draft({ type: null }), NOW)).toThrow();
    expect(() => toCreateEventInput(draft({ label: ' ' }), NOW)).toThrow();
  });
});

it('type passé dans l’adresse : seulement les trois types connus', () => {
  expect(parseEventType('MEAL')).toBe('MEAL');
  expect(parseEventType('TREATMENT')).toBe('TREATMENT');
  expect(parseEventType('meal')).toBeNull();
  expect(parseEventType(undefined)).toBeNull();
  expect(parseEventType(['MEAL'])).toBeNull();
});
