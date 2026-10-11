// Ticket L8-11 : analyse calculée sur le téléphone, depuis la base locale (sans réseau).
// Les mesures reprennent la semaine de référence de L3-01 (packages/analytics/test/reference), placées à
// l'heure LOCALE du téléphone : le résultat doit être celui calculé à la main, quel que soit son fuseau.
import type { MeasurementPoint } from '@/features/measurements';
import { DEFAULT_THRESHOLDS, type GlucoseThresholds } from '@glyka/shared';
import { deviceTimeZone } from '@/lib/time-zone';
import { loadLocalAnalysis, type LocalSources } from '../local-analysis';

/** Instant d'une heure locale du téléphone (mois : 9 = octobre, comme `new Date`). */
const at = (month: number, day: number, hour: number) => new Date(2026, month, day, hour).getTime();

// Semaine du lundi 5 au dimanche 11 octobre 2026 ; J3 et J6 sans mesure.
const WEEK: [string, number, readonly number[] | null][] = [
  ['J1', 5, [95, 140, 175, 120]],
  ['J2', 6, [70, 150, 180, 110]],
  ['J3', 7, null],
  ['J4', 8, [65, 190, 240, 200]],
  ['J5', 9, [100, 160, 210, 130]],
  ['J6', 10, null],
  ['J7', 11, [50, 145, 170, 125]],
];
const SLOTS: [string, number][] = [
  ['matin', 7],
  ['midi', 13],
  ['soir', 19],
  ['nuit', 23],
];
// Semaine d'avant (28 septembre – 2 octobre), matin et soir : 5 dans la cible, 5 au-dessus.
const PREVIOUS: [number, number, number, number][] = [
  [8, 28, 120, 200],
  [8, 29, 110, 210],
  [8, 30, 130, 220],
  [9, 1, 100, 190],
  [9, 2, 140, 230],
];

const points = (): MeasurementPoint[] => [
  ...PREVIOUS.flatMap(([month, day, morning, evening]) => [
    { id: `P${day}-matin`, at: at(month, day, 7), mgDl: morning, context: 'FASTING' as const },
    { id: `P${day}-soir`, at: at(month, day, 19), mgDl: evening, context: 'AFTER_MEAL' as const },
  ]),
  ...WEEK.flatMap(([name, day, values]) =>
    values === null
      ? []
      : SLOTS.map(([slot, hour], i) => ({
          id: `${name}-${slot}`,
          at: at(9, day, hour),
          mgDl: values[i] as number,
          context: 'OTHER' as const,
        })),
  ),
];

/** « Maintenant » : dimanche 11 octobre, 23:30 (heure du téléphone). */
const NOW = new Date(2026, 9, 11, 23, 30).getTime();

/** Fausse base locale : renvoie les mesures entre deux bornes INCLUSES, et note ce qu'on lui demande. */
function sources(data = points(), thresholds: GlucoseThresholds = DEFAULT_THRESHOLDS) {
  const asked: { from: number; to: number }[] = [];
  const s: LocalSources = {
    between: async (from, to) => {
      asked.push({ from, to });
      return data.filter((p) => p.at >= from && p.at <= to);
    },
    thresholds: async () => thresholds,
    timeZone: deviceTimeZone,
  };
  return { s, asked };
}

describe('lecture de la base locale', () => {
  it('lit la période et la période précédente, de minuit à minuit (heure du téléphone)', async () => {
    const { s, asked } = sources();
    await loadLocalAnalysis(7, NOW, s);
    expect(asked).toEqual([
      { from: new Date(2026, 8, 28).getTime(), to: new Date(2026, 9, 12).getTime() - 1 },
    ]);
  });

  it('une mesure pile à minuit ce soir n’appartient pas à la période (fin exclue)', async () => {
    const data = [
      ...points(),
      { id: 'minuit', at: new Date(2026, 9, 12).getTime(), mgDl: 300, context: 'OTHER' as const },
    ];
    const { analysis: r } = await loadLocalAnalysis(7, NOW, sources(data).s);
    expect(r.stats!.count).toBe(20);
  });

  it('aucun appel réseau : tout vient du téléphone', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    await loadLocalAnalysis(30, NOW, sources().s);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('base locale illisible : l’erreur remonte (l’écran affiche « Réessayer »)', async () => {
    const { s } = sources();
    await expect(
      loadLocalAnalysis(7, NOW, { ...s, between: () => Promise.reject(new Error('SQLite')) }),
    ).rejects.toThrow('SQLite');
  });
});

describe('résultat : le jeu de référence calculé à la main (L3-01)', () => {
  it('période des 7 derniers jours, chiffres exacts, qualité 86', async () => {
    const { analysis: r } = await loadLocalAnalysis(7, NOW, sources().s);
    expect(r.period).toEqual({
      from: new Date(2026, 9, 5).toISOString(),
      to: new Date(2026, 9, 12).toISOString(),
    });
    expect(r.stats).toMatchObject({
      count: 20,
      timeInRangePct: 70,
      timeAbovePct: 20,
      timeBelowPct: 10,
      meanMgDl: 141.25,
    });
    expect(r.previousStats).toMatchObject({ count: 10, timeInRangePct: 50, meanMgDl: 165 });
    expect(r.quality).toMatchObject({
      score: 86,
      level: 'GOOD',
      coverage: 71,
      density: 100,
      freshness: 100,
      daysInPeriod: 7,
      daysWithData: 5,
    });
  });

  it('les cinq observations, leurs preuves et leurs phrases', async () => {
    const { analysis: r } = await loadLocalAnalysis(7, NOW, sources().s);
    expect(r.insights.map((i) => [i.type, i.severity, i.evidenceIds])).toEqual([
      ['REPEATED_HYPO', 'ALERT', ['J4-matin', 'J7-matin']],
      ['HIGH_STREAK', 'ATTENTION', ['J4-midi', 'J4-soir', 'J4-nuit']],
      ['TIME_OF_DAY_PATTERN', 'INFO', ['J4-soir', 'J5-soir']],
      ['MISSING_DATA', 'INFO', []],
      ['PERIOD_COMPARISON', 'INFO', []],
    ]);
    expect(r.insights.map((i) => i.text)).toEqual([
      "J'observe 2 mesures sous le seuil bas au cours des 7 derniers jours.",
      "J'observe une série de 3 mesures consécutives au-dessus du seuil haut.",
      'Les valeurs hautes sont plus fréquentes sur le créneau « soir » (40 % contre 20 % en général).',
      '2 jour(s) sur 7 ne contiennent aucune mesure : certaines analyses peuvent être incomplètes.',
      'Temps dans la cible : 70 % (période précédente : 50 %).',
    ]);
    expect(r.disclaimer).toMatch(/pas un diagnostic/);
  });

  it('seuils du patient gardés sur le téléphone (cible 80–160 ⇒ 50 %)', async () => {
    const mine = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 220 };
    const { analysis: r } = await loadLocalAnalysis(7, NOW, sources(points(), mine).s);
    expect(r.stats!.timeInRangePct).toBe(50);
  });

  it('moins de 10 mesures : « données insuffisantes » (pas de chiffres, pas d’observations)', async () => {
    const few = points().filter((p) => p.id.startsWith('J1') || p.id.startsWith('J2'));
    const { analysis: r } = await loadLocalAnalysis(7, NOW, sources(few).s);
    expect(r.stats).toBeNull();
    expect(r.insights).toEqual([]);
    expect(r.quality.analyzable).toBe(false);
  });

  it('renvoie aussi les mesures lues (avec leur contexte) et les seuils, pour l’affichage', async () => {
    const mine = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 220 };
    const result = await loadLocalAnalysis(7, NOW, sources(points(), mine).s);
    expect(result.thresholds).toEqual(mine);
    expect(result.points).toHaveLength(30);
    expect(result.points.find((p) => p.id === 'P28-soir')?.context).toBe('AFTER_MEAL');
  });

  it('30 jours : même semaine, la comparaison n’a plus assez de mesures avant', async () => {
    const { analysis: r } = await loadLocalAnalysis(30, NOW, sources().s);
    expect(r.quality.daysInPeriod).toBe(30);
    expect(r.stats!.count).toBe(30); // la semaine (20) + la semaine d'avant (10)
    expect(r.previousStats).toBeNull();
  });
});
