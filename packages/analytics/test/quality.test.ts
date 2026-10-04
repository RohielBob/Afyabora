import { describe, expect, it } from 'vitest';
import { computeQuality } from '../src';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const period = { from: NOW - 30 * DAY, to: NOW };

const pts = (n: number, perDay: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    at: NOW - Math.floor(i / perDay) * DAY - (i % perDay) * 3_600_000 - 3_600_000,
    mgDl: 120,
  }));

describe('score de qualité', () => {
  it('historique complet : 3 mesures/jour pendant 30 jours → Bonne', () => {
    const q = computeQuality(pts(90, 3), period, NOW);
    expect(q.level).toBe('GOOD');
    expect(q.score).toBeGreaterThanOrEqual(90);
    expect(q.analyzable).toBe(true);
  });

  it('3 mesures en 30 jours → Insuffisante et non analysable', () => {
    const q = computeQuality(pts(3, 1), period, NOW);
    expect(q.level).toBe('INSUFFICIENT');
    expect(q.analyzable).toBe(false);
  });
});
