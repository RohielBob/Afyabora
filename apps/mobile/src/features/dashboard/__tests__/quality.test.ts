// Ticket L2-08 : score de qualité des données et choix de la phrase d'explication (sans interface).
import type { ChartPoint } from '../chart';
import { deviceTimeZone, periodQuality, weakestPart } from '../quality';

// 10 octobre 2026, 09:17, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const point = (id: string, time: number): ChartPoint => ({
  id,
  at: time,
  mgDl: 120,
  context: 'FASTING',
});
/** 3 mesures par jour, du jour `from` au jour `to` (inclus). */
const daily = (from: number, to: number, hours = [7, 13, 20]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .flatMap((d) => hours.map((h) => point(`${d}-${h}`, at(d, h))))
    .filter((p) => p.at <= NOW.getTime());

describe('appel correct du moteur', () => {
  it('« 7 jours » = 7 jours entiers (pas 6), même en début de journée', () => {
    expect(periodQuality(daily(4, 10), 7, NOW).quality.daysInPeriod).toBe(7);
  });

  it('fuseau du téléphone lu pour chaque instant (hiver et été : heure d’été comprise)', () => {
    const tz = deviceTimeZone as (at: number) => number;
    for (const time of [
      at(1, 12),
      new Date(2026, 0, 15, 12).getTime(),
      new Date(2026, 6, 15, 12).getTime(),
    ]) {
      expect(tz(time)).toBe(-new Date(time).getTimezoneOffset());
    }
  });

  it('jours comptés dans le fuseau du téléphone : 23 h 30 et 0 h 30 = deux jours', () => {
    const q = periodQuality([point('a', at(8, 23, 30)), point('b', at(9, 0, 30))], 7, NOW);
    expect(q.quality.daysWithData).toBe(2);
  });
});

describe('score et phrase d’explication', () => {
  it('mesures 3 fois par jour, tous les jours : bonne qualité', () => {
    // Aujourd'hui, une seule mesure à 7 h (il est 9 h 17) : le jour compte quand même.
    const q = periodQuality(daily(4, 10), 7, NOW);
    expect(q.quality.level).toBe('GOOD');
    expect(q.reason).toBe('good');
    expect(q.quality.coverage).toBe(100);
  });

  it('aucune mesure : phrase dédiée', () => {
    const q = periodQuality([], 7, NOW);
    expect(q.reason).toBe('empty');
    expect(q.daysSinceLast).toBeNull();
    expect(q.perDay).toBe(0);
  });

  it('peu de jours mesurés : la couverture est la cause', () => {
    const q = periodQuality(daily(9, 10), 30, NOW); // 2 jours sur 30
    expect(q.quality.level).not.toBe('GOOD');
    expect(q.reason).toBe('coverage');
    expect(q.quality.daysWithData).toBe(2);
  });

  it('une seule mesure par jour : la densité est la cause', () => {
    const q = periodQuality(daily(4, 10, [8]), 7, NOW);
    expect(q.perDay).toBe(1);
    // couverture 100 %, densité 33 %, fraîcheur 100 % → score 80 : déjà « bonne »
    expect(q.quality.level).toBe('GOOD');
    expect(weakestPart(q.quality)).toBe('density');
    // … mais la phrase le dit quand même (densité 33 % < 80 %) au lieu de « mesures régulières ».
    expect(q.reason).toBe('density');
  });

  it('plus rien depuis des jours : la fraîcheur pèse, et on sait depuis quand', () => {
    const q = periodQuality(daily(1, 4), 7, NOW); // dernière mesure le 4 à 20 h
    expect(q.daysSinceLast).toBe(5);
    expect(q.quality.freshness).toBeLessThan(50);
  });
});

describe('composante la plus faible', () => {
  it('pondérée comme la formule (0,5 / 0,3 / 0,2)', () => {
    // Pertes : couverture 0,5 × 40 = 20 ; densité 0,3 × 50 = 15 ; fraîcheur 0,2 × 100 = 20 → égalité :
    // la couverture passe en premier.
    expect(weakestPart({ coverage: 60, density: 50, freshness: 0 })).toBe('coverage');
    expect(weakestPart({ coverage: 100, density: 10, freshness: 100 })).toBe('density');
    expect(weakestPart({ coverage: 90, density: 90, freshness: 0 })).toBe('freshness');
  });
});
