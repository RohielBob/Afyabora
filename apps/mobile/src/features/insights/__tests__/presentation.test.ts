// Ticket L3-04 : écran « Analyse », logique d'affichage (ordre, résumé, mesures concernées, phrases).
import {
  analyzeLastDays,
  renderInsightFr,
  type InsightWithText,
  type LastDaysAnalysis,
} from '@glyka/analytics';
import i18n from '@/i18n';
import type { MeasurementPoint } from '@/features/measurements';
import {
  EVIDENCE_PREVIEW,
  crossedThreshold,
  evidenceOf,
  headlineOf,
  insightSentence,
  orderInsights,
  pointsInPeriod,
} from '../presentation';

const insight = (overrides: Partial<InsightWithText>): InsightWithText => ({
  type: 'MISSING_DATA',
  severity: 'INFO',
  facts: {},
  evidenceIds: [],
  text: '',
  ...overrides,
});

const point = (id: string, at: number, mgDl = 120): MeasurementPoint => ({
  id,
  at,
  mgDl,
  context: 'OTHER',
});

describe('ordre des observations', () => {
  it('alertes, puis « à surveiller », puis informations ; ordre du moteur gardé à égalité', () => {
    const list = [
      insight({ type: 'MISSING_DATA', severity: 'INFO' }),
      insight({ type: 'HIGH_STREAK', severity: 'ATTENTION' }),
      insight({ type: 'PERIOD_COMPARISON', severity: 'INFO' }),
      insight({ type: 'REPEATED_HYPO', severity: 'ALERT' }),
      insight({ type: 'ANOMALY', severity: 'ATTENTION' }),
    ];
    expect(orderInsights(list).map((i) => i.type)).toEqual([
      'REPEATED_HYPO',
      'HIGH_STREAK',
      'ANOMALY',
      'MISSING_DATA',
      'PERIOD_COMPARISON',
    ]);
    expect(list[0]!.type).toBe('MISSING_DATA'); // la liste d'origine n'est pas modifiée
  });
});

describe('résumé du haut de l’écran', () => {
  const NOW = new Date(2026, 9, 11, 20).getTime();
  const day = (d: number, h = 8) => new Date(2026, 9, d, h).getTime();
  const analyse = (points: MeasurementPoint[]): LastDaysAnalysis =>
    analyzeLastDays(points, 7, { now: NOW, timeZone: (at) => -new Date(at).getTimezoneOffset() });

  it('moins de 10 mesures : « insuffisant », avec le nombre et ce qui manque', () => {
    const points = [5, 6, 7, 8].map((d) => point(`m${d}`, day(d)));
    // Une mesure AVANT la période (comparaison) ne compte pas dans « 4 mesures sur 7 jours ».
    points.push(point('avant', day(1)));
    expect(headlineOf(analyse(points), points)).toEqual({
      kind: 'insufficient',
      count: 4,
      missing: 6,
    });
  });

  it('aucune mesure : 0 sur 10', () => {
    expect(headlineOf(analyse([]), [])).toEqual({ kind: 'insufficient', count: 0, missing: 10 });
  });

  it('analyse sans rien à surveiller : « calme » (même avec des informations)', () => {
    // 2 mesures par jour, toujours dans la plage : seule information possible = rien / jours manquants.
    const points = [5, 6, 7, 8, 9, 10, 11].flatMap((d) => [
      point(`a${d}`, day(d, 8), 110),
      point(`b${d}`, day(d, 18), 130),
    ]);
    const result = analyse(points);
    expect(result.insights.every((i) => i.severity === 'INFO')).toBe(true);
    expect(headlineOf(result, points)).toEqual({
      kind: 'calm',
      observations: result.insights.length,
    });
  });

  it('observations à surveiller : leur nombre (alertes comprises)', () => {
    const points = [5, 6, 7, 8, 9, 10, 11].flatMap((d) => [
      point(`a${d}`, day(d, 8), d === 9 || d === 10 ? 50 : 110), // deux valeurs très basses
      point(`b${d}`, day(d, 18), 130),
    ]);
    const result = analyse(points);
    const headline = headlineOf(result, points);
    expect(headline).toMatchObject({ kind: 'watch', watch: 1 });
    expect(result.insights.find((i) => i.severity === 'ALERT')?.type).toBe('REPEATED_HYPO');
  });

  it('« à surveiller » sans alerte : compté aussi (série de valeurs hautes)', () => {
    const points = [5, 6, 7, 8, 9, 10, 11].flatMap((d) => [
      point(`a${d}`, day(d, 8), 110),
      point(`b${d}`, day(d, 13), d === 9 ? 200 : 130),
      point(`c${d}`, day(d, 18), d === 9 ? 210 : 130),
      point(`d${d}`, day(d, 21), d === 9 ? 220 : 130),
    ]);
    const result = analyse(points);
    expect(result.insights.some((i) => i.severity === 'ALERT')).toBe(false);
    expect(result.insights.find((i) => i.severity === 'ATTENTION')?.type).toBe('HIGH_STREAK');
    expect(headlineOf(result, points)).toMatchObject({ kind: 'watch', watch: 1 });
  });

  it('mesures de la période : début inclus, fin exclue', () => {
    const period = {
      from: new Date(2026, 9, 5).toISOString(),
      to: new Date(2026, 9, 12).toISOString(),
    };
    const points = [
      point('debut', new Date(2026, 9, 5).getTime()),
      point('avant', new Date(2026, 9, 5).getTime() - 1),
      point('fin', new Date(2026, 9, 12).getTime()),
    ];
    expect(pointsInPeriod(points, period).map((p) => p.id)).toEqual(['debut']);
  });
});

describe('« Voir les mesures concernées »', () => {
  const points = [point('a', 1000), point('b', 3000), point('c', 2000), point('autre', 4000)];

  it('les mesures de l’observation, de la plus récente à la plus ancienne', () => {
    const i = insight({ evidenceIds: ['a', 'b', 'c'] });
    expect(evidenceOf(i, points).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('une preuve supprimée entre-temps est ignorée (pas de ligne vide)', () => {
    expect(evidenceOf(insight({ evidenceIds: ['a', 'disparue'] }), points)).toHaveLength(1);
  });

  it('aperçu de 5 mesures avant « Afficher les autres »', () => {
    expect(EVIDENCE_PREVIEW).toBe(5);
  });
});

describe('seuil franchi (alerte = observation + seuil + rappel de consulter)', () => {
  it('valeurs basses répétées : sous le seuil bas ; série haute : au-dessus du seuil haut', () => {
    expect(
      crossedThreshold(insight({ type: 'REPEATED_HYPO', facts: { thresholdMgDl: 70 } })),
    ).toEqual({ direction: 'below', mgDl: 70 });
    expect(
      crossedThreshold(insight({ type: 'HIGH_STREAK', facts: { thresholdMgDl: 180 } })),
    ).toEqual({ direction: 'above', mgDl: 180 });
  });

  it('autres observations : pas de seuil', () => {
    expect(crossedThreshold(insight({ type: 'ANOMALY', facts: { count: 2 } }))).toBeNull();
    expect(crossedThreshold(insight({ type: 'REPEATED_HYPO', facts: {} }))).toBeNull();
  });
});

describe('phrases : les traductions françaises = les gabarits du moteur (et donc l’API)', () => {
  const fr = i18n.getFixedT('fr');
  const en = i18n.getFixedT('en');
  const samples: InsightWithText[] = [
    insight({ type: 'REPEATED_HYPO', facts: { count: 3, thresholdMgDl: 70, days: 7 } }),
    insight({ type: 'HIGH_STREAK', facts: { length: 4, thresholdMgDl: 180 } }),
    insight({ type: 'ANOMALY', facts: { count: 1 } }),
    ...['MORNING', 'NOON', 'EVENING', 'NIGHT'].map((slot) =>
      insight({
        type: 'TIME_OF_DAY_PATTERN',
        facts: { slot, slotAbovePct: 45, globalAbovePct: 20 },
      }),
    ),
    insight({ type: 'MISSING_DATA', facts: { daysWithoutData: 2, daysInPeriod: 30 } }),
    insight({
      type: 'PERIOD_COMPARISON',
      facts: { timeInRangePct: 70, previousTimeInRangePct: 52 },
    }),
    insight({ type: 'TREND', facts: {} }),
  ];

  it.each(samples.map((s) => [s.type, s] as const))('%s : mot pour mot', (_, sample) => {
    expect(insightSentence(fr, sample)).toBe(renderInsightFr(sample));
  });

  it('anglais : chaque phrase est traduite (aucune clé brute, aucun trou)', () => {
    for (const sample of samples) {
      const text = insightSentence(en, sample);
      expect(text).not.toMatch(/insights\.|{{|undefined/);
      expect(text).not.toBe(renderInsightFr(sample));
    }
  });
});
