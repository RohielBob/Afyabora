// Ticket L2-11 : modifier une mesure (logique, sans interface).
import { updateMeasurementSchema } from '@glyka/shared';
import {
  canGoForward,
  draftFromMeasurement,
  originalText,
  shiftDays,
  shiftMinutes,
  toUpdatePatch,
  validateEdit,
} from '../edit';
import type { LocalMeasurement } from '../local-store';

// 10 octobre 2026, 09:17, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17);
const MEASURED = new Date(2026, 9, 3, 8, 30); // il y a une semaine

const row = (extra: Partial<LocalMeasurement> = {}): LocalMeasurement => ({
  id: '11111111-1111-4111-8111-111111111111',
  value_mgdl: 148,
  original_value: 1.48,
  original_unit: 'G_L',
  measured_at: MEASURED.toISOString(),
  context: 'FASTING',
  source: 'MANUAL',
  import_batch_id: null,
  note: 'après une marche',
  confirmed_unusual: 0,
  client_updated_at: MEASURED.toISOString(),
  updated_at: MEASURED.toISOString(),
  deleted_at: null,
  pending_sync: 1,
  ...extra,
});

describe('point de départ', () => {
  it('la mesure telle que saisie : valeur et unité d’origine, date, contexte, note', () => {
    expect(draftFromMeasurement(row())).toEqual({
      text: '1,48',
      unit: 'G_L',
      at: MEASURED,
      context: 'FASTING',
      note: 'après une marche',
      confirmedUnusual: false,
    });
    expect(originalText(148)).toBe('148');
  });
});

describe('date et heure', () => {
  it('pas de 5 min ou 1 h ; jours du calendrier', () => {
    expect(shiftMinutes(MEASURED, -5)).toEqual(new Date(2026, 9, 3, 8, 25));
    expect(shiftMinutes(MEASURED, 60)).toEqual(new Date(2026, 9, 3, 9, 30));
    expect(shiftDays(MEASURED, -1)).toEqual(new Date(2026, 9, 2, 8, 30));
  });

  it('jamais dans le futur', () => {
    expect(canGoForward(new Date(2026, 9, 10, 9, 0), 5, NOW)).toBe(true);
    expect(canGoForward(new Date(2026, 9, 10, 9, 15), 60, NOW)).toBe(false);
    expect(
      validateEdit({ ...draftFromMeasurement(row()), at: new Date(2026, 9, 10, 23) }, NOW),
    ).toEqual({ when: 'measurement.problem.future' });
  });
});

describe('validation', () => {
  it('mêmes règles qu’à la saisie ; valeur inhabituelle acceptée une fois confirmée', () => {
    const base = draftFromMeasurement(row());
    expect(validateEdit(base, NOW)).toEqual({});
    expect(validateEdit({ ...base, text: '' }, NOW)).toEqual({
      value: 'measurement.problem.empty',
    });
    expect(validateEdit({ ...base, text: '18,7' }, NOW)).toEqual({
      value: 'measurement.problem.unusual',
    });
    expect(validateEdit({ ...base, text: '18,7', confirmedUnusual: true }, NOW)).toEqual({});
    // Une confirmation restée active ne masque pas une autre erreur (valeur vide).
    expect(validateEdit({ ...base, text: '', confirmedUnusual: true }, NOW)).toEqual({
      value: 'measurement.problem.empty',
    });
  });
});

describe('modification envoyée : seulement ce qui a changé', () => {
  it('rien de changé : rien à écrire', () => {
    expect(toUpdatePatch(row(), draftFromMeasurement(row()))).toBeNull();
  });

  it('note seulement ; note vidée = « » (effacée)', () => {
    const base = draftFromMeasurement(row());
    expect(toUpdatePatch(row(), { ...base, note: ' lecteur vérifié ' })).toEqual({
      note: 'lecteur vérifié',
    });
    expect(toUpdatePatch(row(), { ...base, note: '   ' })).toEqual({ note: '' });
  });

  it('valeur : toujours avec son unité ; même nombre dans une autre unité = changement', () => {
    const base = draftFromMeasurement(row());
    expect(toUpdatePatch(row(), { ...base, text: '1,52' })).toEqual({ value: 1.52, unit: 'G_L' });
    expect(toUpdatePatch(row(), { ...base, unit: 'MMOL_L', text: '8,2' })).toEqual({
      value: 8.2,
      unit: 'MMOL_L',
    });
  });

  it('même nombre, autre unité (« C’était en mmol/L ») : c’est un changement', () => {
    const base = draftFromMeasurement(row());
    expect(toUpdatePatch(row(), { ...base, unit: 'MMOL_L' })).toEqual({
      value: 1.48,
      unit: 'MMOL_L',
    });
  });

  it('nouvelle valeur inhabituelle : la confirmation l’accompagne', () => {
    const base = draftFromMeasurement(row());
    expect(toUpdatePatch(row(), { ...base, text: '18,7', confirmedUnusual: true })).toEqual({
      value: 18.7,
      unit: 'G_L',
      confirmedUnusual: true,
    });
  });

  it('date et contexte ; la modification est valide pour le schéma partagé', () => {
    const base = draftFromMeasurement(row());
    const patch = toUpdatePatch(row(), {
      ...base,
      at: new Date(2026, 9, 3, 9, 30),
      context: 'BEFORE_MEAL',
    });
    expect(patch).toEqual({
      measuredAt: new Date(2026, 9, 3, 9, 30).toISOString(),
      context: 'BEFORE_MEAL',
    });
    expect(updateMeasurementSchema.safeParse(patch).success).toBe(true);
  });
});
