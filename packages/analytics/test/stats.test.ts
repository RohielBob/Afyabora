import { describe, expect, it } from 'vitest';
import {
  analyze,
  computeRangeStats,
  findAnomaliesBySlot,
  findHighStreaks,
  median,
  modifiedZScores,
  renderInsightFr,
} from '../src';

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const DAY = 86_400_000;
const mk = (id: string, mgDl: number, hoursAgo: number) => ({
  id,
  mgDl,
  at: NOW - hoursAgo * 3_600_000,
});

describe('statistiques', () => {
  it('pourcentages dans la cible / au-dessus / en dessous', () => {
    // 10 mesures : 6 dans la cible, 3 au-dessus, 1 en dessous
    const values = [100, 110, 120, 130, 140, 150, 200, 210, 220, 60];
    const s = computeRangeStats(values.map((v, i) => mk(String(i), v, i)));
    expect(s.timeInRangePct).toBe(60);
    expect(s.timeAbovePct).toBe(30);
    expect(s.timeBelowPct).toBe(10);
  });

  it('médiane', () => expect(median([1, 3, 2])).toBe(2));

  it('un pic isolé a un score z modifié élevé', () => {
    const pts = [100, 102, 98, 101, 99, 100, 103, 97, 350].map((v, i) => mk(String(i), v, i));
    const z = modifiedZScores(pts);
    expect(Math.abs(z.get('8') ?? 0)).toBeGreaterThan(3.5);
  });

  it('série de 3 valeurs hautes consécutives', () => {
    const pts = [100, 200, 210, 220, 100].map((v, i) => mk(String(i), v, 10 - i));
    expect(findHighStreaks(pts, 180, 3)).toHaveLength(1);
  });
});

describe('analyze', () => {
  it("refuse d'analyser en dessous de 10 mesures", () => {
    const pts = [100, 110, 120].map((v, i) => mk(String(i), v, i));
    const r = analyze(pts, { from: NOW - 14 * DAY, to: NOW }, { now: NOW });
    expect(r.stats).toBeNull();
    expect(r.insights).toHaveLength(0);
  });
});

describe('habitude régulière vs anomalie', () => {
  // Valeurs hautes TOUS les soirs : c'est une tendance par créneau, pas une anomalie.
  const data = Array.from({ length: 14 }, (_, d) => [
    { id: `m${d}`, at: Date.UTC(2026, 9, 4 - d, 7, 0, 0), mgDl: 110 },
    { id: `n${d}`, at: Date.UTC(2026, 9, 4 - d, 13, 0, 0), mgDl: 120 },
    { id: `e${d}`, at: Date.UTC(2026, 9, 4 - d, 18, 0, 0), mgDl: 230 },
  ]).flat();

  it('ne signale pas les valeurs régulières du soir comme anomalies', () => {
    expect(findAnomaliesBySlot(data)).toHaveLength(0);
  });

  it('signale la tendance du créneau « soir » en français', () => {
    const r = analyze(data, { from: NOW - 14 * DAY, to: NOW }, { now: NOW });
    const slot = r.insights.find((i) => i.type === 'TIME_OF_DAY_PATTERN');
    expect(slot).toBeDefined();
    expect(renderInsightFr(slot!)).toContain('« soir »');
  });
});
