// Jeu de données de référence du moteur d'analyse (L3-01).
// Chaque valeur attendue ci-dessous a été calculée À LA MAIN à partir des règles du cahier des charges
// (§5.2, §5.3), puis recalculée indépendamment par `oracle.py` (Python, module `statistics`), sans
// regarder le code TypeScript. Le détail des calculs est dans `README.md` (même dossier).
import type { GlucosePoint, Period } from '../../src';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Fuseau du jeu : Kinshasa, UTC+1 (valeur par défaut du moteur). */
export const TZ_OFFSET_MINUTES = 60;

/** Instant d'une heure LOCALE (UTC+1) : `local(28, 7)` = 28 septembre 2026, 07:00 à Kinshasa. */
export function local(day: number, hour: number, month = 9): number {
  // `month` est le numéro habituel du mois (9 = septembre, 10 = octobre) ; Date.UTC compte depuis 0.
  return Date.UTC(2026, month - 1, day, hour) - TZ_OFFSET_MINUTES * 60_000;
}

/** Heures locales des quatre mesures d'une journée type (une par créneau). */
const SLOT_HOURS = { matin: 7, midi: 13, soir: 19, nuit: 23 } as const;
type SlotName = keyof typeof SLOT_HOURS;
const SLOT_NAMES = Object.keys(SLOT_HOURS) as SlotName[];

/**
 * Semaine de référence : du lundi 28 septembre au dimanche 4 octobre 2026 (heure locale).
 * Une ligne = un jour, quatre mesures (matin 07 h, midi 13 h, soir 19 h, nuit 23 h), en mg/dL.
 * J3 et J6 : aucune mesure.
 */
export const REFERENCE_WEEK: ReadonlyArray<{
  day: string;
  date: number; // jour de septembre (28–30) ou d'octobre (1–4)
  month: number;
  values: readonly [number, number, number, number] | null;
}> = [
  { day: 'J1', date: 28, month: 9, values: [95, 140, 175, 120] },
  { day: 'J2', date: 29, month: 9, values: [70, 150, 180, 110] }, // 70 et 180 : bornes, DANS la cible
  { day: 'J3', date: 30, month: 9, values: null },
  { day: 'J4', date: 1, month: 10, values: [65, 190, 240, 200] }, // 65 bas ; 190-240-200 : série haute
  { day: 'J5', date: 2, month: 10, values: [100, 160, 210, 130] }, // 210 haute mais isolée
  { day: 'J6', date: 3, month: 10, values: null },
  { day: 'J7', date: 4, month: 10, values: [50, 145, 170, 125] }, // 50 : très bas (< 54)
];

/**
 * Semaine précédente (21–25 septembre) : 10 mesures, matin et soir. 5 dans la cible, 5 au-dessus
 * ⇒ 50 % dans la cible. Sert uniquement à la comparaison avec la période précédente.
 */
export const PREVIOUS_WEEK: ReadonlyArray<{ date: number; morning: number; evening: number }> = [
  { date: 21, morning: 120, evening: 200 },
  { date: 22, morning: 110, evening: 210 },
  { date: 23, morning: 130, evening: 220 },
  { date: 24, morning: 100, evening: 190 },
  { date: 25, morning: 140, evening: 230 },
];

/** Période analysée : 7 jours locaux pleins, du 28 septembre 00:00 au 5 octobre 00:00 (exclu). */
export const REFERENCE_PERIOD: Period = { from: local(28, 0), to: local(5, 0, 10) };
/** « Maintenant » : la fin de la période (la dernière mesure date d'une heure). */
export const REFERENCE_NOW = REFERENCE_PERIOD.to;

export function referenceWeekPoints(): GlucosePoint[] {
  return REFERENCE_WEEK.flatMap(({ day, date, month, values }) =>
    values === null
      ? []
      : SLOT_NAMES.map((slot, i) => ({
          id: `${day}-${slot}`,
          at: local(date, SLOT_HOURS[slot], month),
          mgDl: values[i] as number,
        })),
  );
}

export function previousWeekPoints(): GlucosePoint[] {
  return PREVIOUS_WEEK.flatMap(({ date, morning, evening }) => [
    { id: `P${date}-matin`, at: local(date, 7), mgDl: morning },
    { id: `P${date}-soir`, at: local(date, 19), mgDl: evening },
  ]);
}

/** Mesure APRÈS la période (5 octobre, 08:00) : très haute, elle ne doit compter nulle part. */
export const AFTER_PERIOD: GlucosePoint = { id: 'apres-periode', at: local(5, 8, 10), mgDl: 400 };

/** Le jeu complet tel qu'il arriverait de la base : semaine, semaine précédente, mesure hors période. */
export function referenceDataset(): GlucosePoint[] {
  return [...referenceWeekPoints(), ...previousWeekPoints(), AFTER_PERIOD];
}

/** Résultats attendus (calculés à la main, confirmés par `oracle.py`). */
export const EXPECTED = {
  stats: {
    count: 20,
    meanMgDl: 141.25, // 2 825 / 20
    sdMgDl: 50.83189529170999, // écart-type d'échantillon (n − 1)
    cvPercent: 35.9871825074053, // 50,83… / 141,25 × 100
    timeInRangePct: 70, // 14 / 20
    timeAbovePct: 20, // 190, 240, 200, 210 → 4 / 20
    timeBelowPct: 10, // 65, 50 → 2 / 20
  },
  median: 142.5, // (140 + 145) / 2
  previousStats: {
    count: 10,
    meanMgDl: 165, // 1 650 / 10
    timeInRangePct: 50,
    timeAbovePct: 50,
    timeBelowPct: 0,
  },
  quality: {
    // 0,5 × 5/7 + 0,3 × min(1, 4/3) + 0,2 × 1 = 0,857… → 86
    score: 86,
    level: 'GOOD',
    coverage: 71, // 5 / 7
    density: 100, // 4 mesures par jour couvert, cible 3
    freshness: 100, // dernière mesure il y a 1 heure
    analyzable: true,
    daysInPeriod: 7,
    daysWithData: 5,
  },
  insights: [
    {
      type: 'REPEATED_HYPO',
      severity: 'ALERT', // 50 < 54 (très bas)
      facts: { count: 2, thresholdMgDl: 70, days: 7 },
      evidenceIds: ['J4-matin', 'J7-matin'],
    },
    {
      type: 'HIGH_STREAK',
      severity: 'ATTENTION',
      facts: { length: 3, thresholdMgDl: 180 },
      evidenceIds: ['J4-midi', 'J4-soir', 'J4-nuit'],
    },
    {
      // soir : 2 / 5 = 40 % au-dessus, contre 20 % en général ⇒ écart de 20 points, pile la limite
      type: 'TIME_OF_DAY_PATTERN',
      severity: 'INFO',
      facts: { slot: 'EVENING', slotAbovePct: 40, globalAbovePct: 20 },
      evidenceIds: ['J4-soir', 'J5-soir'],
    },
    {
      type: 'MISSING_DATA',
      severity: 'INFO',
      facts: { daysWithoutData: 2, daysInPeriod: 7 },
      evidenceIds: [],
    },
    {
      type: 'PERIOD_COMPARISON',
      severity: 'INFO',
      facts: { timeInRangePct: 70, previousTimeInRangePct: 50 },
      evidenceIds: [],
    },
  ],
  /** Phrases des gabarits français, dans le même ordre que `insights`. */
  sentences: [
    "J'observe 2 mesures sous le seuil bas au cours des 7 derniers jours.",
    "J'observe une série de 3 mesures consécutives au-dessus du seuil haut.",
    'Les valeurs hautes sont plus fréquentes sur le créneau « soir » (40 % contre 20 % en général).',
    '2 jour(s) sur 7 ne contiennent aucune mesure : certaines analyses peuvent être incomplètes.',
    'Temps dans la cible : 70 % (période précédente : 50 %).',
  ],
} as const;

/**
 * Série du matin pour les anomalies : 10 jours (1er au 10 octobre), une mesure à 07:00.
 * Neuf valeurs stables + `last` le 10 octobre. Médiane 100,5 ; MAD 2 (tant que `last` ≥ 103).
 * Score z modifié de `last` = 0,6745 × (last − 100,5) / 2 :
 *   170 → 23,44 (anomalie) · 111 → 3,541 (anomalie, juste au-dessus de 3,5) · 110 → 3,204 (normal).
 */
export const STABLE_MORNINGS = [96, 98, 99, 100, 100, 101, 102, 103, 104] as const;
export const ANOMALY_PERIOD: Period = { from: local(1, 0, 10), to: local(11, 0, 10) };

export function morningSeries(last: number): GlucosePoint[] {
  return [...STABLE_MORNINGS, last].map((mgDl, i) => ({
    id: `M${i + 1}`,
    at: local(i + 1, 7, 10),
    mgDl,
  }));
}
