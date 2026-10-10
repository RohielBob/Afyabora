// Ticket L2-06 : logique du graphique d'évolution (sans dessin).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import {
  nearestIndex,
  niceStep,
  periodBounds,
  pointsIn,
  polyline,
  segments,
  tickStepDays,
  xTicks,
  yScale,
  type ChartPoint,
} from '../chart';

// 10 octobre 2026, 09:17, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17);
const at = (day: number, hour = 8, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const point = (id: string, time: number, mgDl = 120): ChartPoint => ({
  id,
  at: time,
  mgDl,
  context: 'FASTING',
});

describe('période', () => {
  it('7 jours = aujourd’hui + les 6 jours d’avant, à partir de minuit', () => {
    const { from, to } = periodBounds(7, NOW);
    expect(new Date(from)).toEqual(new Date(2026, 9, 4, 0, 0));
    expect(to).toBe(NOW.getTime() + 5 * 60_000); // tolérance de saisie (horloge en avance)
  });

  it('garde les points de la période, du plus ancien au plus récent', () => {
    const bounds = periodBounds(7, NOW);
    const kept = pointsIn(
      [point('c', at(10, 7)), point('trop-vieux', at(3, 23, 59)), point('a', at(4, 0, 0))],
      bounds,
    );
    expect(kept.map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('axe vertical', () => {
  it('pas « ronds »', () => {
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(0.21)).toBe(0.25);
    expect(niceStep(43)).toBe(50);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(0)).toBe(1);
  });

  it('contient toujours la plage cible et toutes les mesures, graduations dans l’unité', () => {
    const scale = yScale([95, 140], DEFAULT_THRESHOLDS, 'G_L');
    expect(scale.minMgDl).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.targetMinMgDl);
    expect(scale.maxMgDl).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.targetMaxMgDl);
    expect(scale.ticks.map((t) => t.label)).toEqual(['0,50', '1,00', '1,50', '2,00']);
    expect(scale.ticks[0]?.mgDl).toBeCloseTo(50);
  });

  it('une valeur très haute agrandit l’axe ; mg/dL sans décimale ; mmol/L à une décimale', () => {
    const high = yScale([320], DEFAULT_THRESHOLDS, 'MG_DL');
    expect(high.maxMgDl).toBeGreaterThanOrEqual(320);
    expect(high.ticks.every((t) => /^\d+$/.test(t.label))).toBe(true);
    const mmol = yScale([], DEFAULT_THRESHOLDS, 'MMOL_L');
    expect(mmol.ticks.every((t) => /^\d+,\d$/.test(t.label))).toBe(true);
  });

  it('jamais en dessous de zéro, même avec une valeur à 20 mg/dL et une autre à 600', () => {
    expect(yScale([25], DEFAULT_THRESHOLDS, 'MG_DL').minMgDl).toBeGreaterThanOrEqual(0);
    expect(yScale([20, 600], DEFAULT_THRESHOLDS, 'MG_DL').minMgDl).toBe(0);
  });

  it('mesures toutes au-dessus de la cible : la bande cible reste visible', () => {
    const scale = yScale([150, 160], DEFAULT_THRESHOLDS, 'MG_DL');
    expect(scale.minMgDl).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.targetMinMgDl);
  });
});

describe('axe du temps', () => {
  it('écart des graduations selon la période', () => {
    expect([7, 14, 30, 90].map((d) => tickStepDays(d as 7))).toEqual([1, 2, 7, 30]);
  });

  it('7 jours : un repère par jour, aujourd’hui compris', () => {
    const ticks = xTicks(7, periodBounds(7, NOW));
    expect(ticks).toHaveLength(7);
    expect(new Date(ticks[6] as number)).toEqual(new Date(2026, 9, 10));
  });

  it('30 jours : un repère par semaine, en partant d’aujourd’hui', () => {
    const ticks = xTicks(30, periodBounds(30, NOW)).map((t) => new Date(t).getDate());
    expect(ticks).toEqual([12, 19, 26, 3, 10]); // 12/09 → 10/10
  });
});

describe('courbe', () => {
  it('coupée après plus de 2 jours sans mesure', () => {
    const parts = segments([
      point('a', at(1)),
      point('b', at(2)),
      point('c', at(6)), // 4 jours plus tard : nouveau morceau
      point('d', at(8)), // exactement 2 jours : même morceau
    ]);
    expect(parts.map((s) => s.map((p) => p.id))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('mesure la plus proche du doigt', () => {
    const xs = [10, 50, 90];
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 29)).toBe(0);
    expect(nearestIndex(xs, 31)).toBe(1);
    expect(nearestIndex(xs, 70)).toBe(1); // à égale distance : le plus ancien
    expect(nearestIndex(xs, 500)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('tracé SVG et longueur (animation de dessin)', () => {
    expect(
      polyline([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ d: 'M0.0 0.0L3.0 4.0', length: 5 });
  });
});
