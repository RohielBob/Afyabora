// Rapport « Préparer ma consultation » (L6-01, CDC F9) : TOUS les textes du rapport, à partir des données
// (report-data.ts). Le document PDF (report-document.ts) ne fait qu'afficher ces textes : chaque chiffre
// imprimé passe par ici, et les tests le comparent à l'analyse du moteur (test/report-data.test.ts).
//
// Règles d'écriture (CDC §2.4, F9) :
//  - descriptif uniquement : jamais de diagnostic, de cause, de dose ni de conseil de traitement ;
//  - français simple, compréhensible par le patient ET utile au médecin : chaque section dit ce qu'elle
//    mesure (ex. « un épisode = une ou plusieurs mesures consécutives sous la cible ») ;
//  - toutes les valeurs dans l'UNITÉ CHOISIE PAR LE PATIENT (décision d'équipe), seuils compris ;
//  - dates et heures À L'HEURE DU PATIENT (son fuseau) ;
//  - identité : prénom et nom, type de diabète, année du diagnostic ; ni date de naissance ni coordonnées
//    (décision d'équipe : le document peut être imprimé, transmis, oublié sur un bureau).
import { DISCLAIMER_FR, joinFr, type InsightWithText } from '@glyka/analytics';
import {
  formatGlucose,
  fromMgDl,
  UNIT_LABELS,
  type DiabetesType,
  type GlucoseState,
  type GlucoseUnit,
  type MeasurementContext,
  type QualityLevel,
} from '@glyka/shared';
import type { Episode, ReportData, ReportMeasurement } from './report-data';

/** Lignes montrées par tableau d'épisodes (les plus récentes) ; les autres sont comptées. */
export const MAX_EPISODE_ROWS = 10;
/** Valeurs inhabituelles montrées au plus. */
export const MAX_UNUSUAL_ROWS = 12;
/** Jours sans mesure cités un par un au plus. */
export const MAX_LISTED_DAYS = 15;

const DIABETES_FR: Record<DiabetesType, string> = {
  TYPE_1: 'Diabète de type 1',
  TYPE_2: 'Diabète de type 2',
  GESTATIONAL: 'Diabète gestationnel',
  OTHER: 'Autre type de diabète',
};
const QUALITY_FR: Record<QualityLevel, string> = {
  GOOD: 'Bonne',
  PARTIAL: 'Partielle',
  INSUFFICIENT: 'Insuffisante',
};
export const STATE_FR: Record<GlucoseState, string> = {
  VERY_LOW: 'Très bas',
  LOW: 'En dessous',
  IN_RANGE: 'Dans la cible',
  HIGH: 'Au-dessus',
  VERY_HIGH: 'Très haut',
};
const CONTEXT_FR: Record<MeasurementContext, string> = {
  FASTING: 'À jeun',
  BEFORE_MEAL: 'Avant repas',
  AFTER_MEAL: 'Après repas',
  BEDTIME: 'Au coucher',
  NIGHT: 'La nuit',
  OTHER: 'Autre moment',
};
const SLOT_FR: Record<string, string> = {
  MORNING: 'le matin (5 h – 11 h)',
  NOON: 'à midi (11 h – 16 h)',
  EVENING: 'le soir (16 h – 22 h)',
  NIGHT: 'la nuit (22 h – 5 h)',
};
const SEVERITY_RANK = { ALERT: 0, ATTENTION: 1, INFO: 2 } as const;

export interface ReportRow {
  cells: string[];
  /** Mise en avant (épisode sévère) : texte en gras ET mot « très » dans la ligne, jamais la couleur seule. */
  strong?: boolean;
}

export interface ReportTable {
  title: string;
  /** Ce que la section mesure, en une phrase. */
  explanation: string;
  headers: string[];
  rows: ReportRow[];
  /** « … et 4 autres épisodes, plus anciens. » ou message si vide. */
  note: string | null;
}

export interface ChartPoint {
  /** Position dans la période, de 0 (début) à 1 (fin). */
  x: number;
  /** Valeur dans l'unité du patient. */
  value: number;
  state: GlucoseState;
}

export interface ReportView {
  title: string;
  subtitle: string;
  patientName: string;
  patientDetails: string;
  periodText: string;
  generatedText: string;
  unitText: string;
  targetText: string;
  /** Sous 10 mesures : pas de chiffres, ce message à la place. */
  insufficient: string | null;
  quality: {
    score: number;
    level: QualityLevel;
    levelText: string;
    lines: string[];
  };
  keyFigures: { label: string; value: string }[];
  distribution: { below: number; inRange: number; above: number } | null;
  distributionText: string | null;
  comparisonText: string | null;
  summary: string;
  points: string[];
  episodesBelow: ReportTable;
  episodesAbove: ReportTable;
  unusual: ReportTable;
  missingDaysText: string;
  chart: {
    unit: string;
    points: ChartPoint[];
    /** Bornes de l'axe des valeurs et graduations (unité du patient). */
    max: number;
    ticks: number[];
    targetMin: number;
    targetMax: number;
    veryLow: number;
    veryHigh: number;
    /** Jours sans mesure (positions de début et de fin, de 0 à 1). */
    gaps: { from: number; to: number }[];
    /** Graduations de dates (position et texte). */
    dates: { x: number; label: string }[];
  };
  disclaimer: string;
  footer: string;
}

// ------------------------------------------------------------------ dates (heure du patient)

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Date « décalée » : ses champs UTC sont l'heure locale du patient. */
const local = (at: number, offsetMinutes: number) => new Date(at + offsetMinutes * MINUTE_MS);

/** « 19 octobre 2026 » */
export function dateLong(at: number, offset: number): string {
  return local(at, offset).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
/**
 * « Du 6 au 19 octobre 2026 », « Du 20 septembre au 19 octobre 2026 », « Du 20 décembre 2025 au 2 janvier
 * 2026 » : le mois et l'année ne sont écrits qu'une fois quand ils sont les mêmes.
 */
export function periodRange(from: number, to: number, offset: number): string {
  const start = dateLong(from, offset).split(' '); // [jour, mois, année]
  const end = dateLong(to, offset);
  const [, endMonth, endYear] = end.split(' ');
  if (start[2] !== endYear) return `Du ${start.join(' ')} au ${end}`;
  if (start[1] !== endMonth) return `Du ${start[0]} ${start[1]} au ${end}`;
  return `Du ${start[0]} au ${end}`;
}

/** « lun. 13 oct. » */
export function dateShort(at: number, offset: number): string {
  return local(at, offset).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
/** « 07:30 » */
export function time(at: number, offset: number): string {
  return local(at, offset).toLocaleTimeString('fr-FR', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  });
}
const sameDay = (a: number, b: number, offset: number) =>
  Math.floor((a + offset * MINUTE_MS) / DAY_MS) === Math.floor((b + offset * MINUTE_MS) / DAY_MS);

/** Nombre décimal français : « 23,6 ». */
const decimal = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');

/** « 3 mesures », « 1 mesure », « 0 mesure » (en français, 0 et 1 s'accordent au singulier). */
export const plural = (count: number, one: string, many: string) =>
  `${count} ${Math.abs(count) <= 1 ? one : many}`;

// ------------------------------------------------------------------ sections

function episodeTable(
  episodes: readonly Episode[],
  side: Episode['side'],
  unit: GlucoseUnit,
  offset: number,
  target: string,
): ReportTable {
  const recent = [...episodes].sort((a, b) => b.start - a.start);
  const shown = recent.slice(0, MAX_EPISODE_ROWS);
  const below = side === 'below';
  const hidden = recent.length - shown.length;
  return {
    title: below ? 'Épisodes en dessous de la cible' : 'Épisodes au-dessus de la cible',
    explanation: below
      ? `Un épisode = une ou plusieurs mesures consécutives sous ${target}. ${plural(recent.length, 'épisode', 'épisodes')} sur la période.`
      : `Un épisode = une ou plusieurs mesures consécutives au-dessus de ${target}. ${plural(recent.length, 'épisode', 'épisodes')} sur la période.`,
    headers: [
      'Date',
      'Heure',
      'Mesures',
      below ? 'Valeur la plus basse' : 'Valeur la plus haute',
      'Niveau',
    ],
    rows: shown.map((episode) => ({
      strong: episode.severe,
      cells: [
        dateShort(episode.start, offset),
        episode.count === 1
          ? time(episode.start, offset)
          : sameDay(episode.start, episode.end, offset)
            ? `de ${time(episode.start, offset)} à ${time(episode.end, offset)}`
            : `de ${time(episode.start, offset)} au ${dateShort(episode.end, offset)} ${time(episode.end, offset)}`,
        String(episode.count),
        formatGlucose(episode.extremeMgDl, unit),
        episode.severe ? (below ? 'Très bas' : 'Très haut') : below ? 'Bas' : 'Haut',
      ],
    })),
    note:
      recent.length === 0
        ? below
          ? 'Aucune mesure sous la cible sur la période.'
          : 'Aucune mesure au-dessus de la cible sur la période.'
        : hidden > 0
          ? `… et ${plural(hidden, 'autre épisode, plus ancien', 'autres épisodes, plus anciens')}.`
          : null,
  };
}

function unusualTable(
  unusual: readonly (ReportMeasurement & { state: GlucoseState })[],
  unit: GlucoseUnit,
  offset: number,
): ReportTable {
  const recent = [...unusual].sort((a, b) => b.at - a.at);
  const shown = recent.slice(0, MAX_UNUSUAL_ROWS);
  return {
    title: 'Valeurs inhabituelles',
    explanation:
      'Mesures très différentes des autres mesures du même moment de la journée (calcul statistique : score z modifié supérieur à 3,5). À vérifier : erreur de saisie, ou situation particulière.',
    headers: ['Date', 'Heure', 'Valeur', 'Niveau', 'Moment'],
    rows: shown.map((m) => ({
      strong: m.state === 'VERY_LOW' || m.state === 'VERY_HIGH',
      cells: [
        dateShort(m.at, offset),
        time(m.at, offset),
        formatGlucose(m.mgDl, unit),
        STATE_FR[m.state],
        CONTEXT_FR[m.context],
      ],
    })),
    note:
      recent.length === 0
        ? 'Aucune valeur inhabituelle relevée sur la période.'
        : recent.length > shown.length
          ? `… et ${plural(recent.length - shown.length, 'autre valeur', 'autres valeurs')}.`
          : null,
  };
}

/** « 2, 11 et 20 octobre », « 30 septembre, 2 et 5 octobre ». */
export function listDays(days: readonly number[], offset: number): string {
  // Le mois n'est écrit qu'après le dernier jour de ce mois : « 30 septembre, 2 et 5 octobre ».
  const items: string[] = [];
  days.forEach((day, index) => {
    const month = (at: number) =>
      local(at + 12 * 60 * MINUTE_MS, offset) // midi : à l'abri des changements d'heure
        .toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long' });
    const d = local(day + 12 * 60 * MINUTE_MS, offset);
    const next = days[index + 1];
    const lastOfMonth = next === undefined || month(next) !== month(day);
    items.push(lastOfMonth ? `${d.getUTCDate()} ${month(day)}` : String(d.getUTCDate()));
  });
  return joinFr(items);
}

/** Points à examiner : une phrase par observation du moteur, avec les seuils dans l'unité du patient. */
function pointsToExamine(insights: readonly InsightWithText[], unit: GlucoseUnit): string[] {
  const ordered = [...insights].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const out: string[] = [];
  const streaks = ordered.filter((i) => i.type === 'HIGH_STREAK');
  let streaksDone = false;
  for (const insight of ordered) {
    const f = insight.facts;
    switch (insight.type) {
      case 'REPEATED_HYPO':
        out.push(
          `Valeurs basses répétées : ${plural(Number(f.count), 'mesure', 'mesures')} sous ${formatGlucose(Number(f.thresholdMgDl), unit)} au cours des ${f.days} derniers jours${insight.severity === 'ALERT' ? ', dont au moins une très basse' : ''}.`,
        );
        break;
      case 'HIGH_STREAK':
        if (streaksDone) break;
        streaksDone = true;
        out.push(
          `Séries de valeurs hautes : ${plural(streaks.length, 'série', 'séries')} d'au moins 3 mesures consécutives au-dessus de ${formatGlucose(Number(f.thresholdMgDl), unit)} (la plus longue : ${Math.max(...streaks.map((s) => Number(s.facts.length)))} mesures).`,
        );
        break;
      case 'ANOMALY':
        out.push(
          `Valeurs inhabituelles : ${plural(Number(f.count), 'mesure très différente', 'mesures très différentes')} des autres mesures du même moment de la journée (détail plus bas).`,
        );
        break;
      case 'TIME_OF_DAY_PATTERN':
        out.push(
          `Valeurs hautes plus fréquentes ${SLOT_FR[String(f.slot)] ?? String(f.slot)} : ${f.slotAbovePct} % des mesures de ce créneau sont au-dessus de la cible, contre ${f.globalAbovePct} % sur l'ensemble.`,
        );
        break;
      default:
        break; // jours sans mesure et comparaison : dans leurs propres sections
    }
  }
  return out;
}

/** Graduations « rondes » de l'axe des valeurs, selon l'unité (comme le graphique du portail). */
const TICK_STEP: Record<GlucoseUnit, number> = { G_L: 0.5, MG_DL: 50, MMOL_L: 3 };

// ------------------------------------------------------------------ rapport

export function reportView(data: ReportData): ReportView {
  const { patient, analysis, days } = data;
  const unit = patient.preferredUnit;
  const offset = patient.timezoneOffsetMinutes;
  const t = patient.thresholds;
  const g = (mgDl: number) => formatGlucose(mgDl, unit);
  const inUnit = (mgDl: number) => fromMgDl(mgDl, unit);
  const stats = analysis.stats;
  const quality = analysis.quality;
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const target = `${formatGlucose(t.targetMinMgDl, unit, false)} – ${g(t.targetMaxMgDl)}`;
  const lastDay = data.period.to - 1;

  const comparison = analysis.insights.find((i) => i.type === 'PERIOD_COMPARISON');
  const step = TICK_STEP[unit];
  const top = Math.max(inUnit(t.veryHighMgDl), ...data.measurements.map((m) => inUnit(m.mgDl)));
  const ticks = Array.from(
    { length: Math.ceil(top / step) + 1 },
    (_, i) => Math.round(i * step * 10) / 10,
  );
  const span = data.period.to - data.period.from;
  const dateEvery = days <= 14 ? 2 : days <= 30 ? 5 : 15;

  return {
    title: 'Préparer ma consultation',
    subtitle: `Suivi glycémique des ${days} derniers jours`,
    patientName: fullName,
    patientDetails: [
      DIABETES_FR[patient.diabetesType],
      patient.diagnosisYear ? `diagnostiqué en ${patient.diagnosisYear}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    periodText: `${periodRange(data.period.from, lastDay, offset)} · ${days} jours`,
    generatedText: `Généré le ${dateLong(data.generatedAt, offset)} à ${time(data.generatedAt, offset)} par l'application Afyabora, ${
      data.author.kind === 'DOCTOR'
        ? `à la demande du Dr ${data.author.name}, avec l'accord du patient`
        : 'à la demande du patient'
    }.`,
    unitText: `Valeurs en ${UNIT_LABELS[unit]} (unité choisie par le patient). Heures à l'heure locale du patient.`,
    targetText: `Plage cible du patient : ${target}. Très bas : sous ${g(t.veryLowMgDl)}. Très haut : au-dessus de ${g(t.veryHighMgDl)}.`,
    insufficient: stats
      ? null
      : data.measurements.length === 0
        ? 'Aucune mesure sur la période : pas de chiffres à analyser.'
        : `Pas assez de mesures pour une analyse fiable : ${plural(data.measurements.length, 'mesure', 'mesures')} sur la période, il en faut au moins 10. Les mesures existantes figurent dans le graphique.`,
    quality: {
      score: quality.score,
      level: quality.level,
      levelText: QUALITY_FR[quality.level],
      lines: [
        `${plural(quality.daysWithData, 'jour', 'jours')} avec au moins une mesure sur ${quality.daysInPeriod}.`,
        `Régularité ${quality.coverage}/100 · Mesures par jour ${quality.density}/100 · Mesures récentes ${quality.freshness}/100.`,
      ],
    },
    keyFigures: stats
      ? [
          { label: 'Mesures', value: String(stats.count) },
          { label: 'Moyenne', value: stats.meanMgDl === null ? '—' : g(stats.meanMgDl) },
          { label: 'Écart-type', value: stats.sdMgDl === null ? '—' : g(stats.sdMgDl) },
          {
            label: 'Variabilité (CV)',
            value: stats.cvPercent === null ? '—' : `${decimal(stats.cvPercent)} %`,
          },
          {
            label: 'Mesures par jour',
            value: decimal(stats.count / Math.max(1, quality.daysWithData)),
          },
        ]
      : [],
    distribution: data.percents,
    distributionText: data.percents
      ? `Dans la cible ${data.percents.inRange} % · au-dessus ${data.percents.above} % · en dessous ${data.percents.below} % des mesures.`
      : null,
    comparisonText: comparison
      ? `Période précédente (${days} jours avant) : ${comparison.facts.previousTimeInRangePct} % dans la cible, contre ${comparison.facts.timeInRangePct} % sur cette période.`
      : null,
    summary: analysis.summary,
    points: pointsToExamine(analysis.insights, unit),
    episodesBelow: episodeTable(data.episodes.below, 'below', unit, offset, g(t.targetMinMgDl)),
    episodesAbove: episodeTable(data.episodes.above, 'above', unit, offset, g(t.targetMaxMgDl)),
    unusual: unusualTable(data.unusual, unit, offset),
    missingDaysText:
      data.daysWithoutData.length === 0
        ? `Aucun : au moins une mesure chaque jour de la période.`
        : data.daysWithoutData.length <= MAX_LISTED_DAYS
          ? `${plural(data.daysWithoutData.length, 'jour', 'jours')} sans aucune mesure : ${listDays(data.daysWithoutData, offset)}. Les analyses de ces jours-là sont incomplètes.`
          : `${plural(data.daysWithoutData.length, 'jour', 'jours')} sans aucune mesure sur ${days} (zones grisées du graphique). Les analyses de ces jours-là sont incomplètes.`,
    chart: {
      unit: UNIT_LABELS[unit],
      points: data.measurements.map((m) => ({
        x: (m.at - data.period.from) / span,
        value: inUnit(m.mgDl),
        state: m.state,
      })),
      max: ticks[ticks.length - 1] ?? step,
      ticks,
      targetMin: inUnit(t.targetMinMgDl),
      targetMax: inUnit(t.targetMaxMgDl),
      veryLow: inUnit(t.veryLowMgDl),
      veryHigh: inUnit(t.veryHighMgDl),
      gaps: data.daysWithoutData.map((day) => ({
        from: (day - data.period.from) / span,
        to: Math.min(1, (day + DAY_MS - data.period.from) / span),
      })),
      dates: Array.from({ length: Math.floor((days - 1) / dateEvery) + 1 }, (_, i) => {
        const at = data.period.from + i * dateEvery * DAY_MS + 12 * 60 * MINUTE_MS;
        return {
          x: (i * dateEvery + 0.5) / days,
          label: local(at, offset).toLocaleDateString('fr-FR', {
            timeZone: 'UTC',
            day: 'numeric',
            month: 'short',
          }),
        };
      }),
    },
    disclaimer: `Afyabora est un outil d'aide au suivi : ce rapport ne constitue pas un diagnostic et ne remplace pas l'avis d'un professionnel de santé. Il ne contient aucune dose ni conseil de traitement. Les mesures sont saisies ou importées par le patient. ${DISCLAIMER_FR}`,
    footer: `${fullName} · Afyabora, outil d'aide au suivi, ne remplace pas l'avis médical`,
  };
}

/** Texte complet du rapport (tests : tout chiffre imprimé doit s'y trouver). */
export function reportText(view: ReportView): string {
  const table = (t: ReportTable) =>
    [
      t.title,
      t.explanation,
      t.headers.join(' | '),
      ...t.rows.map((r) => r.cells.join(' | ')),
      t.note,
    ]
      .filter(Boolean)
      .join('\n');
  return [
    view.title,
    view.subtitle,
    view.patientName,
    view.patientDetails,
    view.periodText,
    view.generatedText,
    view.unitText,
    view.targetText,
    view.insufficient,
    `Qualité des données : ${view.quality.score}/100 (${view.quality.levelText})`,
    ...view.quality.lines,
    ...view.keyFigures.map((f) => `${f.label} : ${f.value}`),
    view.distributionText,
    view.comparisonText,
    view.summary,
    ...view.points,
    table(view.episodesBelow),
    table(view.episodesAbove),
    table(view.unusual),
    view.missingDaysText,
    view.disclaimer,
  ]
    .filter(Boolean)
    .join('\n');
}
