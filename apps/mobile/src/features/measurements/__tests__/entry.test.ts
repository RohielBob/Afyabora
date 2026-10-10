// Ticket L2-03 : logique de la saisie rapide d'une mesure (sans interface).
import {
  convertText,
  initialWhen,
  isExactDuplicate,
  isInFuture,
  otherUnits,
  parseValue,
  resolveWhen,
  shiftTime,
  toCreateInput,
  validateEntry,
  type EntryDraft,
  type WhenState,
} from '../entry';
import { parseUnit } from '../unit-preference';

// 10 octobre 2026, 09:17:42, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17, 42);

const draft = (overrides: Partial<EntryDraft> = {}): EntryDraft => ({
  text: '1,48',
  unit: 'G_L',
  when: initialWhen(NOW),
  context: 'FASTING',
  note: '',
  ...overrides,
});

describe('valeur saisie', () => {
  it('1,48 g/L (virgule ou point) = 148 mg/dL', () => {
    expect(parseValue('1,48', 'G_L')).toEqual({ value: 1.48, mgDl: 148, problem: null });
    expect(parseValue('1.48', 'G_L')).toEqual({ value: 1.48, mgDl: 148, problem: null });
    expect(parseValue('8,2', 'MMOL_L').mgDl).toBe(148);
    expect(parseValue('148', 'MG_DL').mgDl).toBe(148);
  });

  it('dit ce qui ne va pas : vide, illisible, zéro, trop de décimales', () => {
    expect(parseValue('', 'G_L').problem).toBe('empty');
    expect(parseValue('  ', 'G_L').problem).toBe('empty');
    expect(parseValue('1,4,8', 'G_L').problem).toBe('invalid');
    expect(parseValue('0', 'G_L').problem).toBe('zero');
    expect(parseValue('1,485', 'G_L').problem).toBe('decimals');
    expect(parseValue('8,25', 'MMOL_L').problem).toBe('decimals');
    expect(parseValue('148,5', 'MG_DL').problem).toBe('decimals');
  });

  it('18,7 g/L est inhabituelle (hors 20–600 mg/dL), avec sa conversion', () => {
    expect(parseValue('18,7', 'G_L')).toEqual({ value: 18.7, mgDl: 1870, problem: 'unusual' });
    expect(parseValue('0,15', 'G_L').problem).toBe('unusual');
    expect(parseValue('0,20', 'G_L').problem).toBeNull(); // borne basse incluse
    expect(parseValue('6', 'G_L').problem).toBeNull(); // borne haute incluse
  });

  it('changer d’unité convertit la valeur tapée : 1,48 g/L → 148 mg/dL → 8,2 mmol/L (CDC F2)', () => {
    expect(convertText('1,48', 'G_L', 'MG_DL')).toBe('148');
    expect(convertText('148', 'MG_DL', 'MMOL_L')).toBe('8,2');
    expect(convertText('8,2', 'MMOL_L', 'G_L')).toBe('1,48');
    expect(convertText('', 'G_L', 'MG_DL')).toBe(''); // rien à convertir
    expect(convertText('abc', 'G_L', 'MG_DL')).toBe('abc'); // illisible : laissé tel quel
    expect(convertText('1,48', 'G_L', 'G_L')).toBe('1,48');
  });

  it('aperçu dans les deux autres unités', () => {
    expect(otherUnits('G_L')).toEqual(['MG_DL', 'MMOL_L']);
    expect(otherUnits('MG_DL')).toEqual(['G_L', 'MMOL_L']);
  });

  it('unité mémorisée : valeur inconnue ou absente → g/L (défaut du cahier des charges)', () => {
    expect(parseUnit('MMOL_L')).toBe('MMOL_L');
    expect(parseUnit('KG')).toBe('G_L');
    expect(parseUnit(null)).toBe('G_L');
  });
});

describe('quand ?', () => {
  it('maintenant par défaut, à la minute (secondes à zéro)', () => {
    const when = initialWhen(NOW);
    expect(when.preset).toBe('now');
    expect(resolveWhen(when, NOW)).toEqual(new Date(2026, 9, 10, 9, 17, 0));
  });

  it('raccourcis −30 min et −1 h', () => {
    const base = initialWhen(NOW);
    expect(resolveWhen({ ...base, preset: 'minus30' }, NOW)).toEqual(new Date(2026, 9, 10, 8, 47));
    expect(resolveWhen({ ...base, preset: 'minus60' }, NOW)).toEqual(new Date(2026, 9, 10, 8, 17));
  });

  it('« Autre » : démarre à l’heure actuelle arrondie à 5 min ; hier à 22:30', () => {
    const custom: WhenState = { ...initialWhen(NOW), preset: 'custom' };
    expect(resolveWhen(custom, NOW)).toEqual(new Date(2026, 9, 10, 9, 15));
    expect(resolveWhen({ ...custom, day: 1, hour: 22, minute: 30 }, NOW)).toEqual(
      new Date(2026, 9, 9, 22, 30),
    );
  });

  it('réglage de l’heure par pas de 5 min ou 1 h, avec tour d’horloge', () => {
    const at = (hour: number, minute: number): WhenState => ({
      preset: 'custom',
      day: 0,
      hour,
      minute,
    });
    expect(shiftTime(at(9, 15), 5)).toMatchObject({ hour: 9, minute: 20 });
    expect(shiftTime(at(9, 55), 5)).toMatchObject({ hour: 10, minute: 0 });
    expect(shiftTime(at(0, 0), -5)).toMatchObject({ hour: 23, minute: 55 });
    expect(shiftTime(at(23, 30), 60)).toMatchObject({ hour: 0, minute: 30 });
  });

  it('futur : refusé au-delà de 5 minutes (même tolérance que le serveur)', () => {
    expect(isInFuture(new Date(NOW.getTime() + 4 * 60_000), NOW)).toBe(false);
    expect(isInFuture(new Date(NOW.getTime() + 6 * 60_000), NOW)).toBe(true);
  });
});

describe('formulaire', () => {
  it('complet : aucune erreur', () => {
    expect(validateEntry(draft(), NOW)).toEqual({});
  });

  it('erreurs par champ (clés de traduction)', () => {
    expect(
      validateEntry(
        draft({
          text: '',
          context: null,
          when: { preset: 'custom', day: 0, hour: 23, minute: 0 },
        }),
        NOW,
      ),
    ).toEqual({
      value: 'measurement.problem.empty',
      when: 'measurement.problem.future',
      context: 'measurement.problem.context',
    });
    expect(validateEntry(draft({ text: '18,7' }), NOW)).toEqual({
      value: 'measurement.problem.unusual',
    });
  });

  it('données écrites sur le téléphone : valeur et unité d’origine, date ISO, note sans espaces', () => {
    expect(toCreateInput(draft({ note: '  après une marche ' }), NOW)).toEqual({
      value: 1.48,
      unit: 'G_L',
      measuredAt: new Date(2026, 9, 10, 9, 17, 0).toISOString(),
      context: 'FASTING',
      note: 'après une marche',
      confirmedUnusual: false,
    });
    expect(toCreateInput(draft({ note: '   ' }), NOW)).not.toHaveProperty('note');
  });

  it('refuse de construire une saisie incomplète', () => {
    expect(() => toCreateInput(draft({ context: null }), NOW)).toThrow();
    expect(() => toCreateInput(draft({ text: '' }), NOW)).toThrow();
  });
});

describe('doublon exact (CDC F2 : avertissement)', () => {
  const at = '2026-10-10T07:17:00.000Z';

  it('même minute ET même valeur : doublon', () => {
    expect(
      isExactDuplicate({ mgDl: 148, measuredAt: at }, [
        { valueMgDl: 148, measuredAt: '2026-10-10T07:17:30.000Z' },
      ]),
    ).toBe(true);
  });

  it('autre valeur, ou autre minute : pas un doublon', () => {
    expect(
      isExactDuplicate({ mgDl: 148, measuredAt: at }, [
        { valueMgDl: 149, measuredAt: at },
        { valueMgDl: 148, measuredAt: '2026-10-10T07:18:00.000Z' },
      ]),
    ).toBe(false);
  });
});
