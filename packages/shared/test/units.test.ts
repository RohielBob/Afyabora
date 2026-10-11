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

// L2-12 : conversions exactes, y compris aux frontières et avec l'imprécision des nombres à virgule.
describe('conversion en mg/dL : arrondis exacts (L2-12)', () => {
  it('toutes les valeurs à 2 décimales en g/L : × 100 exactement (0,01 à 60,00 g/L)', () => {
    for (let hundredths = 1; hundredths <= 6000; hundredths++) {
      expect(toMgDl(hundredths / 100, 'G_L')).toBe(hundredths);
    }
  });

  it('les « moitiés » à 3 décimales en g/L s’arrondissent toujours vers le haut', () => {
    expect(toMgDl(1.005, 'G_L')).toBe(101); // donnait 100 avant la correction
    expect(toMgDl(0.145, 'G_L')).toBe(15); // donnait 14
    expect(toMgDl(0.285, 'G_L')).toBe(29); // donnait 28
    for (let thousandths = 5; thousandths <= 6000; thousandths += 10) {
      expect(toMgDl(thousandths / 1000, 'G_L')).toBe((thousandths + 5) / 10);
    }
  });

  it('mmol/L à 1 décimale : produit exact × 18,016, arrondi à l’entier le plus proche', () => {
    for (let tenths = 1; tenths <= 400; tenths++) {
      expect(toMgDl(tenths / 10, 'MMOL_L')).toBe(Math.round((tenths * 18016) / 10000));
    }
  });

  it('frontières des bornes plausibles (20–600 mg/dL) dans chaque unité', () => {
    expect(toMgDl(1.1, 'MMOL_L')).toBe(20); // 19,82 → 20 : plausible
    expect(isPlausible(1.1, 'MMOL_L')).toBe(true);
    expect(toMgDl(1.0, 'MMOL_L')).toBe(18);
    expect(isPlausible(1.0, 'MMOL_L')).toBe(false);
    expect(toMgDl(33.3, 'MMOL_L')).toBe(600); // 599,93 → 600 : plausible
    expect(isPlausible(33.3, 'MMOL_L')).toBe(true);
    expect(toMgDl(33.4, 'MMOL_L')).toBe(602);
    expect(isPlausible(33.4, 'MMOL_L')).toBe(false);
    expect(isPlausible(0.2, 'G_L')).toBe(true);
    expect(isPlausible(0.19, 'G_L')).toBe(false);
    expect(isPlausible(6, 'G_L')).toBe(true);
    expect(isPlausible(6.01, 'G_L')).toBe(false);
  });

  it('mg/dL avec décimale : arrondi à l’entier (148,5 → 149 ; 148,4 → 148)', () => {
    expect(toMgDl(148.5, 'MG_DL')).toBe(149);
    expect(toMgDl(148.4, 'MG_DL')).toBe(148);
  });
});
