// L3-04 : UNE seule règle pour les pourcentages affichés (Accueil, Analyse, phrases du moteur, API).
// Trouvé en vérifiant l'écran Analyse : avec 14 mesures sur 24 dans la plage (58,33 %), l'Accueil affichait
// 59 % (parts qui font 100) et la phrase du moteur 58 % (arrondi simple). Même historique, deux chiffres.
import { describe, expect, it } from 'vitest';
import {
  analyze,
  computeRangeStats,
  displayPercents,
  roundedPercents,
  type GlucosePoint,
} from '../src';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 9, 5); // période : 5 → 12 octobre 2026 (UTC, fuseau 0 pour ce test)

describe('roundedPercents : parts entières qui font toujours 100', () => {
  it.each([
    [
      [33.33, 33.33, 33.34],
      [33, 33, 34],
    ],
    [
      [12.6, 70.2, 17.2],
      [13, 70, 17],
    ],
    [
      [0, 100, 0],
      [0, 100, 0],
    ],
    [
      [70, 20, 10],
      [70, 20, 10],
    ],
  ])('%j ⇒ %j', (values, expected) => {
    expect(roundedPercents(values)).toEqual(expected);
  });

  it('restes égaux (des tiers) : le point va à la plus grande part, jamais au hasard du calcul', () => {
    // 2, 14 et 8 mesures sur 24 : 8,33… / 58,33… / 33,33… (restes égaux à 0,33…).
    const values = [(2 / 24) * 100, (14 / 24) * 100, (8 / 24) * 100];
    expect(roundedPercents(values)).toEqual([8, 59, 33]);
    // Même résultat quel que soit l'ordre : la règle ne dépend que des valeurs.
    expect(roundedPercents([values[2]!, values[0]!, values[1]!])).toEqual([33, 8, 59]);
  });

  it('2, 8 et 2 mesures sur 12 : 17 / 67 / 16 (le calcul brut en machine donnait 17 / 66 / 17)', () => {
    // 16,67 / 66,67 / 16,67 : les trois restes sont égaux ; sans l'arrondi du reste, l'imprécision du
    // calcul les rendait différents et le point allait à une petite part au lieu de la plus grande.
    expect(roundedPercents([(2 / 12) * 100, (8 / 12) * 100, (2 / 12) * 100])).toEqual([17, 67, 16]);
  });

  it('valeur à peine sous un entier (69,999…) : arrondie à l’entier', () => {
    expect(roundedPercents([69.99999999999, 20.00000000001, 10])).toEqual([70, 20, 10]);
  });
});

describe('displayPercents : la répartition affichée', () => {
  it('en dessous / dans la plage / au-dessus, total 100', () => {
    const values = [50, 60, 100, 120, 150, 170, 190, 200, 210, 260, 100, 110];
    const stats = computeRangeStats(values.map((mgDl, i) => ({ id: `v${i}`, at: i, mgDl })));
    const shown = displayPercents(stats)!;
    expect(shown).toEqual({ below: 17, inRange: 50, above: 33 }); // 2, 6 et 4 sur 12
    expect(shown.below + shown.inRange + shown.above).toBe(100);
  });

  it('aucune mesure : null', () => {
    expect(displayPercents(computeRangeStats([]))).toBeNull();
  });
});

describe('les phrases du moteur utilisent les mêmes pourcentages que les écrans', () => {
  // Période : 24 mesures, 2 en dessous, 14 dans la plage, 8 au-dessus (dont les 7 du soir).
  const current: GlucosePoint[] = [];
  for (let d = 0; d < 7; d++) {
    current.push({ id: `m${d}`, at: START + d * DAY + 7 * HOUR, mgDl: 110 });
    current.push({ id: `n${d}`, at: START + d * DAY + 13 * HOUR, mgDl: 130 });
    current.push({ id: `s${d}`, at: START + d * DAY + 19 * HOUR, mgDl: 220 });
  }
  current.push({ id: 'x0', at: START + 23 * HOUR, mgDl: 200 });
  current.push({ id: 'x1', at: START + DAY + 23 * HOUR, mgDl: 60 });
  current.push({ id: 'x2', at: START + 2 * DAY + 23 * HOUR, mgDl: 60 });
  // Période précédente : 12 mesures, 1 en dessous, 7 dans la plage, 4 au-dessus.
  const previous: GlucosePoint[] = [60, ...Array(7).fill(120), ...Array(4).fill(200)].map(
    (mgDl: number, i) => ({ id: `p${i}`, at: START - 7 * DAY + i * 12 * HOUR, mgDl }),
  );
  const result = analyze(
    [...previous, ...current],
    { from: START, to: START + 7 * DAY },
    {
      now: START + 7 * DAY,
      timeZone: 0,
    },
  );

  it('comparaison : 59 % (comme l’Accueil), pas 58 %', () => {
    const comparison = result.insights.find((i) => i.type === 'PERIOD_COMPARISON')!;
    expect(comparison.facts).toEqual({ timeInRangePct: 59, previousTimeInRangePct: 59 });
    expect(comparison.facts.timeInRangePct).toBe(displayPercents(result.stats!)!.inRange);
    expect(result.stats!.timeInRangePct).toBeCloseTo(58.333, 3); // la valeur exacte reste exacte
  });

  it('11 mesures dont 5 hautes (45,45 %) : la phrase dit 46 %, comme les écrans (et non 45 %)', () => {
    // 2 en dessous, 4 dans la plage, 5 au-dessus (tous le soir) : répartition affichée 18 / 36 / 46.
    const few: GlucosePoint[] = [
      ...[0, 1, 2, 3, 4].map((d) => ({ id: `s${d}`, at: START + d * DAY + 19 * HOUR, mgDl: 220 })),
      ...[0, 1, 2, 3].map((d) => ({ id: `m${d}`, at: START + d * DAY + 7 * HOUR, mgDl: 120 })),
      { id: 'b0', at: START + 5 * DAY + 7 * HOUR, mgDl: 60 },
      { id: 'b1', at: START + 6 * DAY + 7 * HOUR, mgDl: 60 },
    ];
    const r = analyze(
      few,
      { from: START, to: START + 7 * DAY },
      { now: START + 7 * DAY, timeZone: 0 },
    );
    expect(displayPercents(r.stats!)).toEqual({ below: 18, inRange: 36, above: 46 });
    const slot = r.insights.find((i) => i.type === 'TIME_OF_DAY_PATTERN')!;
    expect(slot.facts).toEqual({ slot: 'EVENING', slotAbovePct: 100, globalAbovePct: 46 });
  });

  it('créneau du soir : « 100 % contre 33 % en général », le 33 affiché sur les écrans', () => {
    const slot = result.insights.find((i) => i.type === 'TIME_OF_DAY_PATTERN')!;
    expect(slot.facts).toEqual({ slot: 'EVENING', slotAbovePct: 100, globalAbovePct: 33 });
    expect(slot.facts.globalAbovePct).toBe(displayPercents(result.stats!)!.above);
  });
});
