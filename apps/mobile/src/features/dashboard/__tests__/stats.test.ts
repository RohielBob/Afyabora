// Ticket L2-07 : statistiques et comparaison avec la période précédente (sans interface).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import type { ChartPoint } from '../chart';
import {
  meanChange,
  periodStats,
  previousBounds,
  roundedPercents,
  timeInRangeChange,
} from '../stats';

// 10 octobre 2026, 09:17, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17);
const day = (d: number, hour = 8) => new Date(2026, 9, d, hour).getTime();
const point = (id: string, at: number, mgDl: number): ChartPoint => ({
  id,
  at,
  mgDl,
  context: 'FASTING',
});
/** n mesures le jour d (à des heures différentes), toutes à la même valeur. */
const many = (prefix: string, d: number, n: number, mgDl: number) =>
  Array.from({ length: n }, (_, i) => point(`${prefix}${i}`, day(d, 6 + i), mgDl));

describe('période précédente', () => {
  it('les 7 jours juste avant, sans recouvrement', () => {
    const { from, to } = previousBounds(7, NOW);
    expect(new Date(from)).toEqual(new Date(2026, 8, 27)); // 27 sept., minuit
    expect(to).toBe(new Date(2026, 9, 4).getTime() - 1); // jusqu'à la veille du 4 oct. incluse
  });
});

describe('règle des 10 mesures (CDC : « Données insuffisantes »)', () => {
  it('moins de 10 mesures : pas de statistiques, mais le nombre est connu', () => {
    const result = periodStats(many('a', 9, 9, 120), 7, NOW, DEFAULT_THRESHOLDS);
    expect(result).toEqual({ count: 9, stats: null, previous: null });
  });

  it('10 mesures : statistiques du moteur (moyenne, temps dans la cible…)', () => {
    const points = [...many('a', 8, 5, 100), ...many('b', 9, 5, 200)];
    const { stats, count } = periodStats(points, 7, NOW, DEFAULT_THRESHOLDS);
    expect(count).toBe(10);
    expect(stats?.meanMgDl).toBe(150);
    expect(stats?.timeInRangePct).toBe(50); // 100 dans la plage, 200 au-dessus
    expect(stats?.timeAbovePct).toBe(50);
  });

  it('période précédente comptée à part, et seulement si elle a 10 mesures', () => {
    const points = [...many('now', 9, 10, 120), ...many('old', 1, 10, 220)];
    const result = periodStats(points, 7, NOW, DEFAULT_THRESHOLDS);
    expect(result.stats?.meanMgDl).toBe(120);
    expect(result.previous?.meanMgDl).toBe(220);
    const fewBefore = periodStats(
      [...many('now', 9, 10, 120), ...many('old', 1, 4, 220)],
      7,
      NOW,
      DEFAULT_THRESHOLDS,
    );
    expect(fewBefore.previous).toBeNull();
  });
});

describe('pourcentages', () => {
  it('font toujours 100', () => {
    expect(roundedPercents([33.33, 33.33, 33.34])).toEqual([33, 33, 34]);
    expect(roundedPercents([12.6, 70.2, 17.2])).toEqual([13, 70, 17]);
    expect(roundedPercents([0, 100, 0])).toEqual([0, 100, 0]);
  });
});

describe('comparaison avec la période précédente (↑ ↓ →)', () => {
  const stats = (timeInRangePct: number, meanMgDl: number) => ({
    count: 20,
    meanMgDl,
    sdMgDl: 30,
    cvPercent: 20,
    timeInRangePct,
    timeAbovePct: 100 - timeInRangePct,
    timeBelowPct: 0,
  });

  it('temps dans la cible : en points, stable sous 5 points', () => {
    expect(timeInRangeChange(stats(72, 140), stats(64, 140))).toEqual({
      direction: 'up',
      delta: 8,
    });
    expect(timeInRangeChange(stats(60, 140), stats(70, 140))).toEqual({
      direction: 'down',
      delta: -10,
    });
    expect(timeInRangeChange(stats(66, 140), stats(62, 140))).toEqual({
      direction: 'flat',
      delta: 4,
    });
    // Pile 5 points : c'est déjà une hausse.
    expect(timeInRangeChange(stats(67, 140), stats(62, 140))).toEqual({
      direction: 'up',
      delta: 5,
    });
  });

  it('moyenne : en mg/dL, stable sous 5 % de la moyenne précédente', () => {
    expect(meanChange(stats(70, 160), stats(70, 140))).toEqual({ direction: 'up', delta: 20 });
    expect(meanChange(stats(70, 130), stats(70, 150))).toEqual({ direction: 'down', delta: -20 });
    expect(meanChange(stats(70, 146), stats(70, 140))).toEqual({ direction: 'flat', delta: 6 });
  });
});
