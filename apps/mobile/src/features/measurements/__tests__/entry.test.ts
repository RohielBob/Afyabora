// Tickets L2-03 et L2-04 : logique de la saisie rapide d'une mesure (sans interface).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import {
  convertText,
  formatReading,
  formatTyped,
  initialWhen,
  isExactDuplicate,
  isInFuture,
  likelyUnits,
  otherUnits,
  parseValue,
  plausibleRange,
  resolveWhen,
  safetyLevel,
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
  confirmedUnusual: false,
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

/** Espace fine insécable (séparateur des milliers à la française). */
const NNBSP = String.fromCharCode(0x202f);

describe('valeur inhabituelle : confirmation (L2-04, CDC F2)', () => {
  it('18,7 g/L : refusée tant qu’elle n’est pas confirmée, acceptée une fois confirmée', () => {
    expect(validateEntry(draft({ text: '18,7' }), NOW)).toEqual({
      value: 'measurement.problem.unusual',
    });
    expect(validateEntry(draft({ text: '18,7', confirmedUnusual: true }), NOW)).toEqual({});
  });

  it('la confirmation n’efface pas les autres erreurs de la valeur (vide, illisible, décimales)', () => {
    expect(validateEntry(draft({ text: '', confirmedUnusual: true }), NOW).value).toBe(
      'measurement.problem.empty',
    );
    expect(validateEntry(draft({ text: '1,485', confirmedUnusual: true }), NOW).value).toBe(
      'measurement.problem.decimals',
    );
  });

  it('confirmedUnusual envoyé à vrai SEULEMENT pour une valeur réellement inhabituelle', () => {
    expect(toCreateInput(draft({ text: '18,7', confirmedUnusual: true }), NOW)).toMatchObject({
      value: 18.7,
      unit: 'G_L',
      confirmedUnusual: true,
    });
    // Confirmation restée d'une ancienne saisie, valeur normale : rien à confirmer.
    expect(
      toCreateInput(draft({ text: '1,48', confirmedUnusual: true }), NOW).confirmedUnusual,
    ).toBe(false);
  });

  it('erreur d’unité probable : même nombre plausible dans une autre unité', () => {
    expect(likelyUnits('18,7', 'G_L')).toEqual(['MMOL_L']); // 18,7 mmol/L = 337 mg/dL
    expect(likelyUnits('148', 'G_L')).toEqual(['MG_DL']);
    expect(likelyUnits('5', 'MG_DL')).toEqual(['G_L', 'MMOL_L']); // 500 mg/dL ou 90 mg/dL
    expect(likelyUnits('1870', 'MG_DL')).toEqual([]); // aucune unité ne lui donne un sens
    expect(likelyUnits('1,48', 'G_L')).toEqual([]); // valeur normale : rien à proposer
  });

  it('textes : milliers séparés à la française, plage plausible dans l’unité choisie', () => {
    expect(formatReading(1870, 'MG_DL')).toBe('1\u202F870 mg/dL');
    expect(formatReading(1870, 'G_L')).toBe('18,70 g/L');
    expect(formatReading(148, 'MG_DL')).toBe('148 mg/dL');
    // Question : la valeur telle que tapée, pas arrondie par la conversion (187 et non 187,0).
    expect(formatTyped('187', 'MMOL_L')).toBe('187 mmol/L');
    expect(formatTyped('18.7', 'G_L')).toBe('18,7 g/L');
    expect(formatTyped('1870', 'MG_DL')).toBe(`1${NNBSP}870 mg/dL`);
    expect(plausibleRange('G_L')).toEqual({ min: '0,20 g/L', max: '6,00 g/L' });
    expect(plausibleRange('MMOL_L')).toEqual({ min: '1,1 mmol/L', max: '33,3 mmol/L' });
  });
});

describe('message de sécurité (L2-04, CDC F2)', () => {
  const own = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 220 };

  it('seuils par défaut : très bas sous 54, très haut au-dessus de 250, sinon rien', () => {
    expect(safetyLevel(53, DEFAULT_THRESHOLDS)).toBe('VERY_LOW');
    expect(safetyLevel(54, DEFAULT_THRESHOLDS)).toBeNull();
    expect(safetyLevel(148, DEFAULT_THRESHOLDS)).toBeNull();
    expect(safetyLevel(250, DEFAULT_THRESHOLDS)).toBeNull();
    expect(safetyLevel(251, DEFAULT_THRESHOLDS)).toBe('VERY_HIGH');
  });

  it('seuils du patient : ce sont les siens qui comptent', () => {
    expect(safetyLevel(58, own)).toBe('VERY_LOW'); // 58 < 60 (mais pas < 54)
    expect(safetyLevel(230, own)).toBe('VERY_HIGH'); // 230 > 220 (mais pas > 250)
    expect(safetyLevel(70, own)).toBeNull(); // simplement bas : pas de message
  });

  it('valeur inhabituelle confirmée très haute : message aussi (1 870 mg/dL)', () => {
    expect(safetyLevel(1870, DEFAULT_THRESHOLDS)).toBe('VERY_HIGH');
  });
});
