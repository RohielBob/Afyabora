// Résumé de la période en langage clair (L3-06, IA-3, CDC F6 et F9) : quelques phrases qui disent l'essentiel
// et listent les « points à examiner avec votre professionnel de santé ». Base du rapport PDF (F9).
//
// Comme pour les observations : les FAITS du résumé sont calculés ici (summaryFacts), puis mis en mots par un
// gabarit français (renderSummaryFr), toujours disponible, même hors-ligne et sans modèle de langage. Un
// modèle peut ensuite le reformuler (API), sous garde-fous. Le téléphone le met en mots avec ses traductions
// à partir des mêmes faits (identique en français, vérifié par un test).
// Formulation descriptive uniquement : jamais de diagnostic, de cause, de dose ni de conseil.
import type { InsightType, QualityLevel } from '@glyka/shared';
import { displayPercents } from './stats';
import type { Insight, QualityScore, RangeStats } from './types';

/** Observations qui deviennent un « point à examiner » (les autres sont déjà dans les chiffres). */
export type SummaryPoint = Extract<
  InsightType,
  'REPEATED_HYPO' | 'HIGH_STREAK' | 'ANOMALY' | 'TIME_OF_DAY_PATTERN'
>;

export type SummaryFacts =
  | { kind: 'insufficient'; days: number }
  | {
      kind: 'analysis';
      days: number;
      count: number;
      qualityLevel: QualityLevel;
      qualityScore: number;
      /** Répartition affichée partout (displayPercents). */
      inRange: number;
      above: number;
      below: number;
      /** Temps dans la cible de la période précédente (affiché), ou null s'il n'y a pas de comparaison. */
      previousInRange: number | null;
      /** Points à examiner, par gravité puis dans l'ordre du moteur, chacun une seule fois. */
      points: SummaryPoint[];
      /** Créneaux où les valeurs hautes sont plus fréquentes (pour TIME_OF_DAY_PATTERN). */
      slots: string[];
      /** Jours sans mesure, ou null s'il n'en manque aucun. */
      missingDays: number | null;
      daysInPeriod: number;
    };

const POINT_TYPES: readonly SummaryPoint[] = [
  'REPEATED_HYPO',
  'HIGH_STREAK',
  'ANOMALY',
  'TIME_OF_DAY_PATTERN',
];
const SEVERITY_RANK = { ALERT: 0, ATTENTION: 1, INFO: 2 } as const;

/** Faits du résumé, à partir du résultat du moteur (même période que les observations). */
export function summaryFacts(
  result: { quality: QualityScore; stats: RangeStats | null; insights: readonly Insight[] },
  days: number,
): SummaryFacts {
  const shown = result.stats ? displayPercents(result.stats) : null;
  if (!result.stats || !shown) return { kind: 'insufficient', days };

  const ordered = result.insights
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] || a.index - b.index,
    )
    .map(({ insight }) => insight);
  const points: SummaryPoint[] = [];
  for (const insight of ordered) {
    const type = insight.type as SummaryPoint;
    if (POINT_TYPES.includes(type) && !points.includes(type)) points.push(type);
  }
  const comparison = result.insights.find((i) => i.type === 'PERIOD_COMPARISON');
  const missing = result.insights.find((i) => i.type === 'MISSING_DATA');

  return {
    kind: 'analysis',
    days,
    count: result.stats.count,
    qualityLevel: result.quality.level,
    qualityScore: result.quality.score,
    inRange: shown.inRange,
    above: shown.above,
    below: shown.below,
    previousInRange: comparison ? Number(comparison.facts.previousTimeInRangePct) : null,
    points,
    slots: result.insights
      .filter((i) => i.type === 'TIME_OF_DAY_PATTERN')
      .map((i) => String(i.facts.slot)),
    missingDays: missing ? Number(missing.facts.daysWithoutData) : null,
    daysInPeriod: result.quality.daysInPeriod,
  };
}

const LEVEL_FR: Record<QualityLevel, string> = {
  GOOD: 'bonne',
  PARTIAL: 'partielle',
  INSUFFICIENT: 'insuffisante',
};

const SLOT_FR: Record<string, string> = {
  MORNING: 'le matin',
  NOON: 'à midi',
  EVENING: 'le soir',
  NIGHT: 'la nuit',
};

/** « a », « a et b », « a, b et c ». */
export function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function pointFr(point: SummaryPoint, slots: readonly string[]): string {
  switch (point) {
    case 'REPEATED_HYPO':
      return 'des valeurs basses répétées';
    case 'HIGH_STREAK':
      return 'une série de valeurs hautes';
    case 'ANOMALY':
      return 'des valeurs inhabituelles';
    case 'TIME_OF_DAY_PATTERN':
      return `des valeurs hautes plus fréquentes ${joinFr(slots.map((s) => SLOT_FR[s] ?? s))}`;
  }
}

/** Résumé en français (gabarit) : toujours disponible, même hors-ligne et sans modèle de langage. */
export function renderSummaryFr(facts: SummaryFacts): string {
  if (facts.kind === 'insufficient') {
    return `Pas encore assez de mesures sur les ${facts.days} derniers jours pour une analyse fiable (il en faut au moins 10).`;
  }
  const sentences = [
    `Sur les ${facts.days} derniers jours, ${facts.count} mesures ont été analysées (qualité des données : ${LEVEL_FR[facts.qualityLevel]}, ${facts.qualityScore}/100).`,
    `Elles étaient dans la cible ${facts.inRange} % du temps, au-dessus ${facts.above} % et en dessous ${facts.below} %.`,
  ];
  if (facts.previousInRange !== null) {
    sentences.push(
      `Sur la période précédente, le temps dans la cible était de ${facts.previousInRange} %.`,
    );
  }
  sentences.push(
    facts.points.length > 0
      ? `Points à examiner avec votre professionnel de santé : ${joinFr(facts.points.map((p) => pointFr(p, facts.slots)))}.`
      : "Aucun point particulier n'a été relevé sur cette période.",
  );
  if (facts.missingDays !== null) {
    sentences.push(
      `${facts.missingDays} jour(s) sur ${facts.daysInPeriod} sans mesure : certaines analyses peuvent être incomplètes.`,
    );
  }
  return sentences.join(' ');
}
