import { describe, expect, it } from 'vitest';
import {
  classifyGlucose,
  formatGlucose,
  fromMgDl,
  isPlausible,
  parseDecimal,
  toMgDl,
} from '../src';

describe("conversion d'unités", () => {
  it('1,48 g/L = 148 mg/dL', () => expect(toMgDl(1.48, 'G_L')).toBe(148));
  it('aller-retour g/L sans perte', () => expect(fromMgDl(toMgDl(1.31, 'G_L'), 'G_L')).toBe(1.31));
  it('5,5 mmol/L ≈ 99 mg/dL', () => expect(toMgDl(5.5, 'MMOL_L')).toBe(99));
  it("148 mg/dL s'affiche 1,48 g/L", () => expect(formatGlucose(148, 'G_L')).toBe('1,48 g/L'));
  it("148 mg/dL s'affiche 148 mg/dL", () => expect(formatGlucose(148, 'MG_DL')).toBe('148 mg/dL'));
});

describe('plausibilité', () => {
  it('18,7 g/L est inhabituel (unité probablement erronée)', () =>
    expect(isPlausible(18.7, 'G_L')).toBe(false));
  it('18,7 mmol/L est plausible', () => expect(isPlausible(18.7, 'MMOL_L')).toBe(true));
  it('0,02 g/L est inhabituel', () => expect(isPlausible(0.02, 'G_L')).toBe(false));
});

describe('classification', () => {
  it.each([
    [50, 'VERY_LOW'],
    [65, 'LOW'],
    [70, 'IN_RANGE'],
    [180, 'IN_RANGE'],
    [181, 'HIGH'],
    [251, 'VERY_HIGH'],
  ])('%i mg/dL → %s', (mg, state) => expect(classifyGlucose(mg)).toBe(state));
});

describe('parseDecimal', () => {
  it('accepte la virgule', () => expect(parseDecimal('1,48')).toBe(1.48));
  it('accepte le point', () => expect(parseDecimal('1.48')).toBe(1.48));
  it('refuse le texte', () => expect(parseDecimal('abc')).toBeNull());
});
