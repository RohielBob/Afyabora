// L3-01 : le moteur d'analyse confronté à un jeu de données de référence dont TOUS les résultats
// ont été calculés à la main et recalculés indépendamment (oracle.py). Critère du cahier des charges
// (F6) : « avec un jeu de test connu, le moteur retrouve exactement les pourcentages attendus ».
import { describe, expect, it } from 'vitest';
import type { GlucoseThresholds } from '@glyka/shared';
import {
  analyze,
  computeQuality,
  computeRangeStats,
  findAnomaliesBySlot,
  median,
  modifiedZScores,
  qualityLevel,
  renderInsightFr,
  slotOf,
  standardDeviation,
  type GlucosePoint,
  type Insight,
} from '../../src';
import {
  AFTER_PERIOD,
  ANOMALY_PERIOD,
  DAY,
  EXPECTED,
  HOUR,
  REFERENCE_NOW,
  REFERENCE_PERIOD,
  local,
  morningSeries,
  previousWeekPoints,
  referenceDataset,
  referenceWeekPoints,
} from './reference-data';

const run = (points: GlucosePoint[]) => analyze(points, REFERENCE_PERIOD, { now: REFERENCE_NOW });

/** Le jeu de référence avec une seule valeur changée (pour tester chaque règle à sa limite). */
const withValue = (id: string, mgDl: number) =>
  referenceDataset().map((p) => (p.id === id ? { ...p, mgDl } : p));

/** Mélange déterministe (même ordre à chaque exécution) : on n'utilise pas Math.random. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  let seed = 7;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe('jeu de référence : la semaine type (20 mesures, 2 jours sans mesure)', () => {
  const result = run(referenceDataset());

  it('le jeu est bien construit (20 mesures dans la période, créneaux en heure locale)', () => {
    const week = referenceWeekPoints();
    expect(week).toHaveLength(20);
    expect(week.every((p) => p.at >= REFERENCE_PERIOD.from && p.at < REFERENCE_PERIOD.to)).toBe(
      true,
    );
    // 07 h, 13 h, 19 h et 23 h à Kinshasa (UTC+1) tombent dans les quatre créneaux, dans l'ordre.
    expect(week.slice(0, 4).map((p) => slotOf(p.at))).toEqual([
      'MORNING',
      'NOON',
      'EVENING',
      'NIGHT',
    ]);
  });

  it('retrouve EXACTEMENT les pourcentages et les statistiques calculés à la main', () => {
    const s = result.stats!;
    expect(s.count).toBe(EXPECTED.stats.count);
    expect(s.timeInRangePct).toBe(EXPECTED.stats.timeInRangePct);
    expect(s.timeAbovePct).toBe(EXPECTED.stats.timeAbovePct);
    expect(s.timeBelowPct).toBe(EXPECTED.stats.timeBelowPct);
    expect(s.meanMgDl).toBe(EXPECTED.stats.meanMgDl);
    expect(s.sdMgDl).toBeCloseTo(EXPECTED.stats.sdMgDl, 10);
    expect(s.cvPercent).toBeCloseTo(EXPECTED.stats.cvPercent, 10);
    expect(median(referenceWeekPoints().map((p) => p.mgDl))).toBe(EXPECTED.median);
  });

  it('statistiques de la période précédente (comparaison)', () => {
    expect(result.previousStats).toMatchObject(EXPECTED.previousStats);
  });

  it('score de qualité : 86 / 100, « Bonne », avec le détail des trois composantes', () => {
    expect(result.quality).toEqual(EXPECTED.quality);
  });

  it('observations : exactement les cinq attendues, dans l’ordre, avec leurs preuves', () => {
    expect(result.insights).toEqual(EXPECTED.insights);
  });

  it('phrases en français : exactement celles calculées à la main', () => {
    expect(result.insights.map(renderInsightFr)).toEqual(EXPECTED.sentences);
  });

  it('traçabilité : chaque preuve est une mesure de la période qui justifie vraiment l’observation', () => {
    const inPeriodById = new Map(referenceWeekPoints().map((p) => [p.id, p]));
    const evidence = (type: Insight['type']) =>
      result.insights.find((i) => i.type === type)!.evidenceIds.map((id) => inPeriodById.get(id));
    for (const insight of result.insights) {
      for (const id of insight.evidenceIds) expect(inPeriodById.has(id)).toBe(true);
    }
    expect(evidence('REPEATED_HYPO').every((p) => p!.mgDl < 70)).toBe(true);
    expect(evidence('HIGH_STREAK').every((p) => p!.mgDl > 180)).toBe(true);
    expect(
      evidence('TIME_OF_DAY_PATTERN').every((p) => p!.mgDl > 180 && slotOf(p!.at) === 'EVENING'),
    ).toBe(true);
  });

  it('une mesure après la période (400 mg/dL) ne compte nulle part', () => {
    expect(run(referenceDataset().filter((p) => p.id !== AFTER_PERIOD.id))).toEqual(result);
  });

  it('résultat identique quel que soit l’ordre des mesures reçues (moteur déterministe)', () => {
    expect(run(shuffled(referenceDataset()))).toEqual(result);
    expect(run([...referenceDataset()].reverse())).toEqual(result);
  });
});

describe('jeu de référence : chaque règle à sa limite (une seule valeur changée)', () => {
  const types = (points: GlucosePoint[]) => run(points).insights.map((i) => i.type);

  it('hypoglycémies répétées : 54 n’est pas « très bas » ⇒ ATTENTION au lieu d’ALERTE', () => {
    const hypo = run(withValue('J7-matin', 54)).insights[0]!;
    expect(hypo).toMatchObject({ type: 'REPEATED_HYPO', severity: 'ATTENTION' });
    expect(hypo.facts.count).toBe(2);
  });

  it('hypoglycémies répétées : une seule mesure basse ⇒ pas d’observation', () => {
    expect(types(withValue('J7-matin', 70))).not.toContain('REPEATED_HYPO');
  });

  it('hypoglycémie hors des 7 derniers jours : ne compte pas', () => {
    // On analyse 14 jours : la mesure basse de la semaine précédente est hors de la fenêtre de 7 jours.
    const points = referenceDataset().map((p) => (p.id === 'P21-matin' ? { ...p, mgDl: 40 } : p));
    const r = analyze(
      points,
      { from: REFERENCE_PERIOD.from - 7 * DAY, to: REFERENCE_PERIOD.to },
      { now: REFERENCE_NOW },
    );
    const hypo = r.insights.find((i) => i.type === 'REPEATED_HYPO')!;
    expect(hypo.evidenceIds).toEqual(['J4-matin', 'J7-matin']);
  });

  it('série haute : 180 est DANS la cible ⇒ la série 190-180-200 est coupée', () => {
    expect(types(withValue('J4-soir', 180))).not.toContain('HIGH_STREAK');
  });

  it('série haute : la mesure suivante haute allonge la série (4 mesures)', () => {
    const streak = run(withValue('J5-matin', 181)).insights.find((i) => i.type === 'HIGH_STREAK')!;
    expect(streak.facts.length).toBe(4);
    expect(streak.evidenceIds).toEqual(['J4-midi', 'J4-soir', 'J4-nuit', 'J5-matin']);
  });

  it('créneau : écart de 20 points signalé, de 15 points non (soir 1 / 5 contre 15 %)', () => {
    // J5-soir 210 → 150 : soir 20 % (1 / 5), global 15 % (3 / 20) ⇒ écart 5 < 20.
    expect(types(withValue('J5-soir', 150))).not.toContain('TIME_OF_DAY_PATTERN');
  });

  it('créneau : 181 au lieu de 180 le soir ⇒ 60 % contre 25 %', () => {
    const slot = run(withValue('J2-soir', 181)).insights.find(
      (i) => i.type === 'TIME_OF_DAY_PATTERN',
    )!;
    expect(slot.facts).toEqual({ slot: 'EVENING', slotAbovePct: 60, globalAbovePct: 25 });
  });

  it('créneau : moins de 5 mesures dans le créneau ⇒ pas de signalement', () => {
    const fourEvenings = referenceDataset().filter((p) => p.id !== 'J1-soir');
    expect(types(fourEvenings)).not.toContain('TIME_OF_DAY_PATTERN');
  });

  it('comparaison : période précédente avec moins de 10 mesures ⇒ pas de comparaison', () => {
    // Même règle que pour l'analyse elle-même (§5.3) : on ne compare pas à des données insuffisantes.
    const nine = referenceDataset().filter((p) => p.id !== 'P25-soir');
    const r = run(nine);
    expect(r.previousStats).toBeNull();
    expect(r.insights.map((i) => i.type)).not.toContain('PERIOD_COMPARISON');
  });

  it('comparaison : aucune mesure avant la période ⇒ pas de comparaison', () => {
    const r = run(referenceWeekPoints());
    expect(r.previousStats).toBeNull();
    expect(r.insights.map((i) => i.type)).not.toContain('PERIOD_COMPARISON');
  });

  it('données manquantes : aucune observation quand tous les jours ont une mesure', () => {
    const full = [
      ...referenceDataset(),
      { id: 'J3-midi', at: local(30, 13), mgDl: 120 },
      { id: 'J6-midi', at: local(3, 13, 10), mgDl: 120 },
    ];
    expect(types(full)).not.toContain('MISSING_DATA');
  });

  it('blocage : 9 mesures dans la période ⇒ ni statistiques ni observations', () => {
    const nine = referenceWeekPoints().slice(0, 9);
    const r = run([...nine, ...previousWeekPoints()]);
    expect(r.stats).toBeNull();
    expect(r.previousStats).toBeNull();
    expect(r.insights).toEqual([]);
    expect(r.quality.analyzable).toBe(false);
  });

  it('blocage : 10 mesures dans la période ⇒ analyse faite', () => {
    const ten = referenceWeekPoints().slice(0, 10);
    expect(run(ten).stats?.count).toBe(10);
    expect(run(ten).quality.analyzable).toBe(true);
  });
});

describe('jeu de référence : anomalies statistiques (score z modifié, seuil 3,5)', () => {
  const anomalies = (last: number) =>
    analyze(morningSeries(last), ANOMALY_PERIOD, { now: ANOMALY_PERIOD.to }).insights.filter(
      (i) => i.type === 'ANOMALY',
    );

  it('scores z modifiés calculés à la main (médiane 100,5 ; MAD 2)', () => {
    const z = modifiedZScores(morningSeries(170));
    expect(z.get('M10')).toBeCloseTo(23.4389, 4); // 0,6745 × 69,5 / 2
    expect(z.get('M1')).toBeCloseTo(-1.5176, 4); // 0,6745 × (96 − 100,5) / 2
  });

  it('170 mg/dL au milieu de valeurs vers 100 : une anomalie, avec sa preuve', () => {
    expect(anomalies(170)).toEqual([
      { type: 'ANOMALY', severity: 'ATTENTION', facts: { count: 1 }, evidenceIds: ['M10'] },
    ]);
  });

  it('limite : 111 (z = 3,541) signalé, 110 (z = 3,204) non', () => {
    expect(anomalies(111)).toHaveLength(1);
    expect(anomalies(110)).toHaveLength(0);
  });

  it('moins de 8 mesures dans le créneau : pas de score, donc pas d’anomalie', () => {
    const sevenMornings = morningSeries(170).slice(3); // M4 … M10 : 7 matins
    const noons = [1, 2, 3].map((d) => ({ id: `N${d}`, at: local(d, 13, 10), mgDl: 120 }));
    const r = analyze([...sevenMornings, ...noons], ANOMALY_PERIOD, { now: ANOMALY_PERIOD.to });
    expect(r.stats?.count).toBe(10);
    expect(r.insights.map((i) => i.type)).not.toContain('ANOMALY');
  });

  it('les créneaux sont séparés : 170 le soir n’est pas comparé aux matins', () => {
    const mornings = morningSeries(100); // 10 matins stables
    const evening = { id: 'S1', at: local(5, 19, 10), mgDl: 170 };
    expect(findAnomaliesBySlot([...mornings, evening])).toEqual([]);
  });

  it('limite connue : MAD nul (valeurs toutes identiques) ⇒ aucun score calculé', () => {
    // Avec 9 × 100 et un 300, la moitié des écarts à la médiane vaut 0 : la formule divise par 0.
    // Le moteur choisit de ne rien signaler plutôt qu'un score faux (documenté dans le README).
    const flat = [...Array(9).fill(100), 300].map((mgDl, i) => ({
      id: `F${i}`,
      at: local(i + 1, 7, 10),
      mgDl,
    }));
    expect(modifiedZScores(flat).size).toBe(0);
  });
});

describe('jeu de référence : statistiques et seuils', () => {
  it('écart-type d’échantillon (n − 1) sur un jeu classique : 2, 4, 4, 4, 5, 5, 7, 9', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(standardDeviation(values)).toBeCloseTo(2.138089935299395, 12);
    const s = computeRangeStats(values.map((mgDl, i) => ({ id: `v${i}`, at: i, mgDl })));
    expect(s.meanMgDl).toBe(5);
    expect(s.cvPercent).toBeCloseTo(42.7617987059879, 10);
    expect(median(values)).toBe(4.5);
  });

  it('cas vides : aucune mesure ⇒ valeurs nulles ; une mesure ⇒ pas d’écart-type', () => {
    expect(computeRangeStats([])).toEqual({
      count: 0,
      meanMgDl: null,
      sdMgDl: null,
      cvPercent: null,
      timeInRangePct: null,
      timeAbovePct: null,
      timeBelowPct: null,
    });
    const one = computeRangeStats([{ id: 'a', at: 0, mgDl: 120 }]);
    expect(one).toMatchObject({ count: 1, meanMgDl: 120, sdMgDl: null, cvPercent: null });
    expect(median([])).toBeNull();
  });

  it('bornes des seuils par défaut : 70 et 180 dans la cible ; 54 et 69 en dessous ; 181 et 251 au-dessus', () => {
    const values = [53, 54, 69, 70, 180, 181, 250, 251];
    const s = computeRangeStats(values.map((mgDl, i) => ({ id: `b${i}`, at: i, mgDl })));
    expect(s.timeBelowPct).toBe(37.5); // 53, 54, 69
    expect(s.timeInRangePct).toBe(25); // 70, 180
    expect(s.timeAbovePct).toBe(37.5); // 181, 250, 251
  });

  it('seuils personnels du patient respectés (cible 80–160)', () => {
    const mine: GlucoseThresholds = {
      veryLowMgDl: 60,
      targetMinMgDl: 80,
      targetMaxMgDl: 160,
      veryHighMgDl: 220,
    };
    const values = [79, 80, 160, 161];
    const s = computeRangeStats(
      values.map((mgDl, i) => ({ id: `t${i}`, at: i, mgDl })),
      mine,
    );
    expect([s.timeBelowPct, s.timeInRangePct, s.timeAbovePct]).toEqual([25, 50, 25]);

    // Dans analyze : la semaine de référence avec ces seuils change le temps dans la cible.
    const r = analyze(referenceDataset(), REFERENCE_PERIOD, {
      now: REFERENCE_NOW,
      thresholds: mine,
    });
    // dans 80–160 : 95, 140, 120, 150, 110, 160, 100, 130, 145, 125 ⇒ 10 / 20
    expect(r.stats?.timeInRangePct).toBe(50);
  });
});

describe('jeu de référence : score de qualité (§5.3), cas calculés à la main', () => {
  // Période de 30 jours finissant le 5 octobre à minuit (heure locale). Les mesures sont placées à
  // 20 h, 16 h, 12 h… (heure locale) de chaque jour couvert, en remontant depuis le 4 octobre.
  const END = local(5, 0, 10);
  const period = { from: END - 30 * DAY, to: END };
  function quality(daysWith: number, perDay: number, daysSinceLast: number) {
    const points: GlucosePoint[] = [];
    for (let d = 0; d < daysWith; d++) {
      for (let j = 0; j < perDay; j++) {
        points.push({ id: `${d}-${j}`, at: END - d * DAY - (4 + 4 * j) * HOUR, mgDl: 120 });
      }
    }
    const lastAt = END - 4 * HOUR;
    return computeQuality(points, period, lastAt + daysSinceLast * DAY);
  }

  it.each([
    // jours couverts, mesures/jour, jours depuis la dernière → score, couverture, densité, fraîcheur, niveau
    [30, 3, 0, 100, 100, 100, 100, 'GOOD'],
    [15, 2, 4, 55, 50, 67, 50, 'PARTIAL'],
    [30, 1, 7, 60, 100, 33, 0, 'PARTIAL'],
    [3, 1, 10, 15, 10, 33, 0, 'INSUFFICIENT'],
  ] as const)(
    '%i jours sur 30, %i par jour, dernière il y a %i jours ⇒ %i',
    (daysWith, perDay, since, score, coverage, density, freshness, level) => {
      expect(quality(daysWith, perDay, since)).toMatchObject({
        score,
        coverage,
        density,
        freshness,
        level,
        daysInPeriod: 30,
        daysWithData: daysWith,
      });
    },
  );

  it('fraîcheur : 100 jusqu’à 1 jour, 75 à 2,5 jours, 0 à partir de 7 jours', () => {
    expect(quality(30, 3, 1).freshness).toBe(100);
    expect(quality(30, 3, 2.5).freshness).toBe(75);
    expect(quality(30, 3, 7).freshness).toBe(0);
    expect(quality(30, 3, 12).freshness).toBe(0);
  });

  it('niveaux : 75 Bonne, 74 et 40 Partielle, 39 Insuffisante', () => {
    expect([75, 74, 40, 39].map(qualityLevel)).toEqual([
      'GOOD',
      'PARTIAL',
      'PARTIAL',
      'INSUFFICIENT',
    ]);
  });

  it('aucune mesure : score 0, « Insuffisante », non analysable', () => {
    // 0,5 × 0 + 0,3 × 0 + 0,2 × 0 = 0
    expect(computeQuality([], period, END)).toMatchObject({
      score: 0,
      level: 'INSUFFICIENT',
      analyzable: false,
      daysWithData: 0,
    });
  });

  it('jours comptés en heure LOCALE : 23 h 30 à Kinshasa reste le même jour', () => {
    // 4 octobre 23:30 locale = 22:30 UTC, et 4 octobre 00:30 locale = 3 octobre 23:30 UTC.
    const twoTimes = [
      { id: 'a', at: local(4, 0, 10) + 30 * 60_000, mgDl: 120 },
      { id: 'b', at: local(4, 23, 10) + 30 * 60_000, mgDl: 120 },
    ];
    expect(computeQuality(twoTimes, period, END).daysWithData).toBe(1);
  });
});

describe('gabarits : jamais de diagnostic, de dose ni de cause affirmée', () => {
  const FORBIDDEN =
    /diagnos|dose|insuline|traitement|médicament|vous devez|il faut|prenez|à cause|parce que|undefined|NaN/i;
  const oneOfEach: Insight[] = [
    ...EXPECTED.insights.map((i) => ({ ...i, facts: { ...i.facts }, evidenceIds: [] })),
    { type: 'ANOMALY', severity: 'ATTENTION', facts: { count: 1 }, evidenceIds: [] },
    { type: 'TREND', severity: 'INFO', facts: {}, evidenceIds: [] },
  ];

  it.each(oneOfEach.map((i) => [i.type, i] as const))('%s : phrase descriptive', (_, insight) => {
    const text = renderInsightFr(insight);
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('tous les créneaux sont traduits (pas de code technique affiché)', () => {
    const slots = ['MORNING', 'NOON', 'EVENING', 'NIGHT'];
    const texts = slots.map((slot) =>
      renderInsightFr({
        type: 'TIME_OF_DAY_PATTERN',
        severity: 'INFO',
        facts: { slot, slotAbovePct: 50, globalAbovePct: 20 },
        evidenceIds: [],
      }),
    );
    expect(texts.map((t) => /« (\w+) »/.exec(t)?.[1])).toEqual(['matin', 'midi', 'soir', 'nuit']);
  });
});
