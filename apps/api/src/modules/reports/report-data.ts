// Rapport « Préparer ma consultation » (L6-01, CDC F9) : les DONNÉES du rapport, calculées sans base ni
// réseau (fonction pure, testée : test/report-data.test.ts).
//
// Règle d'or (CDC F9 : « les chiffres du PDF sont identiques à ceux du tableau de bord ») : tous les
// chiffres viennent d'`analyzeLastDays` (@glyka/analytics), LA MÊME fonction que l'écran « Analyse » du
// téléphone et que GET /insights : même période (N derniers jours entiers, à l'heure du patient), mêmes
// seuils (ceux du patient), même répartition (displayPercents), mêmes observations, même résumé.
// Ce fichier ajoute seulement ce que le rapport détaille en plus, avec les mêmes règles :
//  - les ÉPISODES en dessous et au-dessus de la cible : une suite de mesures CONSÉCUTIVES dans le même
//    sens (classées par classifyGlucose, comme partout) ; « sévère » si l'une est très basse / très haute ;
//  - les VALEURS INHABITUELLES : exactement les mesures citées par l'observation ANOMALY du moteur ;
//  - les JOURS SANS MESURE de la période (à l'heure du patient) : leur nombre est celui de la qualité des
//    données (quality.daysWithData).
// Aucune phrase ici : la mise en mots est dans report-view.ts.
import {
  analyzeLastDays,
  displayPercents,
  lastDaysPeriod,
  localDayNumber,
  localMidnight,
  type DisplayPercents,
  type LastDaysAnalysis,
} from '@glyka/analytics';
import {
  classifyGlucose,
  type DiabetesType,
  type GlucoseState,
  type GlucoseThresholds,
  type GlucoseUnit,
  type MeasurementContext,
} from '@glyka/shared';

/** Périodes du rapport (contrat : ReportPeriod). */
export const REPORT_DAYS = [14, 30, 90] as const;
export type ReportDays = (typeof REPORT_DAYS)[number];

/** Ce que le rapport montre du patient (décision d'équipe : ni date de naissance ni coordonnées). */
export interface ReportPatient {
  firstName: string;
  lastName: string;
  diabetesType: DiabetesType;
  diagnosisYear: number | null;
  /** Unité choisie par le patient : toutes les valeurs du rapport sont écrites dans cette unité. */
  preferredUnit: GlucoseUnit;
  thresholds: GlucoseThresholds;
  /** Fuseau du patient (décalage fixe en minutes) : jours et heures sont ceux du patient. */
  timezoneOffsetMinutes: number;
}

export interface ReportMeasurement {
  id: string;
  /** Instant de la mesure (ms, UTC). */
  at: number;
  mgDl: number;
  context: MeasurementContext;
}

/** Qui a demandé le rapport : le patient, ou un médecin à qui il a donné l'accès (L6-04). */
export type ReportAuthor = { kind: 'PATIENT' } | { kind: 'DOCTOR'; name: string };

export interface ReportInput {
  patient: ReportPatient;
  /** Mesures non supprimées de la période ET de la période précédente (comparaison), dans n'importe quel ordre. */
  measurements: ReportMeasurement[];
  days: ReportDays;
  /** Heure de génération (ms). */
  now: number;
  author: ReportAuthor;
}

/** Une suite de mesures consécutives du même côté de la cible. */
export interface Episode {
  side: 'below' | 'above';
  start: number;
  end: number;
  count: number;
  /** Valeur la plus basse (en dessous) ou la plus haute (au-dessus), en mg/dL. */
  extremeMgDl: number;
  /** Au moins une mesure très basse / très haute. */
  severe: boolean;
}

export interface ReportData {
  days: ReportDays;
  generatedAt: number;
  author: ReportAuthor;
  patient: ReportPatient;
  /** Période analysée [from ; to[ (ms), la même que l'écran « Analyse ». */
  period: { from: number; to: number };
  /** Analyse du moteur, telle que l'affiche l'application (chiffres, observations, résumé). */
  analysis: LastDaysAnalysis;
  /** Répartition affichée partout (null sous 10 mesures). */
  percents: DisplayPercents | null;
  /** Mesures de la période, de la plus ancienne à la plus récente, avec leur état. */
  measurements: (ReportMeasurement & { state: GlucoseState })[];
  episodes: { below: Episode[]; above: Episode[] };
  /** Mesures citées par l'observation « valeurs inhabituelles » du moteur. */
  unusual: (ReportMeasurement & { state: GlucoseState })[];
  /** Jours de la période sans aucune mesure (minuit, heure du patient, en ms UTC). */
  daysWithoutData: number[];
}

const sideOf = (state: GlucoseState): Episode['side'] | null =>
  state === 'LOW' || state === 'VERY_LOW'
    ? 'below'
    : state === 'HIGH' || state === 'VERY_HIGH'
      ? 'above'
      : null;

/** Suites de mesures consécutives (ordre chronologique) en dessous / au-dessus de la cible. */
export function findEpisodes(
  measurements: readonly (ReportMeasurement & { state: GlucoseState })[],
): { below: Episode[]; above: Episode[] } {
  const below: Episode[] = [];
  const above: Episode[] = [];
  let current: Episode | null = null;
  for (const m of measurements) {
    const side = sideOf(m.state);
    if (current && side === current.side) {
      current.end = m.at;
      current.count += 1;
      current.extremeMgDl =
        side === 'below'
          ? Math.min(current.extremeMgDl, m.mgDl)
          : Math.max(current.extremeMgDl, m.mgDl);
      current.severe ||= m.state === 'VERY_LOW' || m.state === 'VERY_HIGH';
      continue;
    }
    if (current) (current.side === 'below' ? below : above).push(current);
    current = side
      ? {
          side,
          start: m.at,
          end: m.at,
          count: 1,
          extremeMgDl: m.mgDl,
          severe: m.state === 'VERY_LOW' || m.state === 'VERY_HIGH',
        }
      : null;
  }
  if (current) (current.side === 'below' ? below : above).push(current);
  return { below, above };
}

/** Construit toutes les données du rapport. */
export function buildReport(input: ReportInput): ReportData {
  const { patient, days, now } = input;
  const timeZone = patient.timezoneOffsetMinutes;
  const points = input.measurements.map((m) => ({ id: m.id, at: m.at, mgDl: m.mgDl }));
  const analysis = analyzeLastDays(points, days, {
    now,
    thresholds: patient.thresholds,
    timeZone,
  });
  const period = lastDaysPeriod(days, now, timeZone);

  const measurements = input.measurements
    .filter((m) => m.at >= period.from && m.at < period.to)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => ({ ...m, state: classifyGlucose(m.mgDl, patient.thresholds) }));

  const anomaly = analysis.insights.find((insight) => insight.type === 'ANOMALY');
  const unusualIds = new Set(anomaly?.evidenceIds ?? []);

  const withData = new Set(measurements.map((m) => localDayNumber(m.at, timeZone)));
  const firstDay = localDayNumber(period.from, timeZone);
  const daysWithoutData: number[] = [];
  for (let day = firstDay; day < firstDay + days; day++) {
    if (!withData.has(day)) daysWithoutData.push(localMidnight(day, timeZone));
  }

  return {
    days,
    generatedAt: now,
    author: input.author,
    patient,
    period,
    analysis,
    percents: analysis.stats ? displayPercents(analysis.stats) : null,
    measurements,
    episodes: findEpisodes(measurements),
    unusual: measurements.filter((m) => unusualIds.has(m.id)),
    daysWithoutData,
  };
}
