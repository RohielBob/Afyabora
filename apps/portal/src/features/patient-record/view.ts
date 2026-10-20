// Dossier patient (L5-12, CDC F8) : ce que les onglets affichent, en règles pures testées sans navigateur
// (__tests__/view.test.ts). Les données arrivent DÉJÀ filtrées par le serveur ; ces règles ne servent qu'à
// présenter (onglets montrés, unité, états, regroupement par jour, messages d'erreur).
import {
  formatGlucose,
  fromMgDl,
  SHARE_CATEGORIES,
  STATE_SYMBOLS,
  type GlucoseState,
  type GlucoseUnit,
  type InsightDto,
  type ShareCategory,
  type TimelineItem,
} from '@glyka/shared';
import { dateLocale, fill, texts } from '@/i18n';
import { ApiError } from '@/lib/api-client';

// ---------- Onglets ----------

export const RECORD_TABS = [
  'overview',
  'glucose',
  'timeline',
  'treatments',
  'meals',
  'activity',
  'summary',
  'report',
] as const;
export type RecordTab = (typeof RECORD_TABS)[number];

/** Onglet ⇒ catégorie(s) qui le rendent visible (vue d'ensemble : toujours). */
const TAB_NEEDS: Record<RecordTab, readonly ShareCategory[] | null> = {
  overview: null,
  glucose: ['GLUCOSE_HISTORY'],
  timeline: ['GLUCOSE_HISTORY', 'MEALS', 'ACTIVITY', 'TREATMENTS'],
  treatments: ['TREATMENTS'],
  meals: ['MEALS'],
  activity: ['ACTIVITY'],
  summary: ['AI_SUMMARY'],
  report: ['REPORT_DOWNLOAD'], // L6-04 : seulement si le patient a coché « Rapport PDF »
};

/** Onglets d'un partage : un onglet dont la catégorie n'est pas partagée n'est PAS affiché (CDC F8). */
export function tabsFor(categories: readonly ShareCategory[]): RecordTab[] {
  return RECORD_TABS.filter((tab) => {
    const needs = TAB_NEEDS[tab];
    return !needs || needs.some((category) => categories.includes(category));
  });
}

/** Onglet demandé dans l'adresse, s'il existe pour ce partage ; sinon la vue d'ensemble. */
export function pickTab(wanted: string | null, tabs: readonly RecordTab[]): RecordTab {
  return tabs.find((tab) => tab === wanted) ?? 'overview';
}

/** Onglets « évènements déclarés » : le type de ligne de la chronologie qu'ils montrent. */
export const TAB_KIND = { treatments: 'TREATMENT', meals: 'MEAL', activity: 'ACTIVITY' } as const;

/** Catégories dans l'ordre du contrat. */
export function orderedCategories(categories: readonly ShareCategory[]): ShareCategory[] {
  return SHARE_CATEGORIES.filter((category) => categories.includes(category));
}

// ---------- Période ----------

/** Périodes proposées (en jours), comme l'application du patient. */
export const PERIODS = [7, 14, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: PeriodDays = 30;

/** Début de la période (« les N derniers jours » jusqu'à maintenant), en UTC. */
export function periodStart(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

// ---------- Valeurs et états ----------

export const UNITS: readonly GlucoseUnit[] = ['G_L', 'MG_DL', 'MMOL_L'];

/** « 1,20 g/L », « 120 mg/dL », « 6,7 mmol/L ». */
export function valueText(mgDl: number, unit: GlucoseUnit, withUnit = true): string {
  return formatGlucose(mgDl, unit, withUnit);
}

/** Valeur numérique dans l'unité (axe du graphique). */
export function valueIn(mgDl: number, unit: GlucoseUnit): number {
  return fromMgDl(mgDl, unit);
}

/** État d'une mesure : symbole + libellé (jamais la couleur seule) et nom de ses couleurs (`state-…`). */
export function stateView(state: GlucoseState): { symbol: string; label: string; slug: string } {
  return {
    symbol: STATE_SYMBOLS[state].symbol,
    label: texts.record.states[state],
    slug: state.toLowerCase().replace(/_/g, '-'),
  };
}

/** Nombre en français : « 12,3 ». */
export function decimal(value: number, digits = 0): string {
  return value.toFixed(digits).replace('.', ',');
}

// ---------- Dates ----------

/** « 08:12 » (heure de l'ordinateur du médecin). */
export function timeText(iso: string): string {
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

/** « 17 oct. à 08:12 ». */
export function dateTimeText(iso: string): string {
  const at = new Date(iso);
  return fill(texts.patients.dateTime, {
    date: at.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }),
    time: timeText(iso),
  });
}

/** Titre d'un jour : « Aujourd'hui », « Hier », sinon « samedi 17 octobre ». */
export function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (at.toDateString() === now.toDateString()) return texts.record.timeline.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return texts.record.timeline.yesterday;
  return at.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Chronologie ----------

/**
 * Texte d'une ligne : « 1,20 g/L · À jeun » pour une mesure ; pour un évènement, le libellé du patient et sa
 * durée s'il l'a notée (« Marche · 40 min », contrat 0.4.2).
 */
export function itemText(item: TimelineItem, unit: GlucoseUnit): string {
  if (item.kind === 'MEASUREMENT' && item.valueMgDl !== null) {
    const context = texts.record.contexts[item.label as keyof typeof texts.record.contexts];
    return context
      ? `${valueText(item.valueMgDl, unit)} · ${context}`
      : valueText(item.valueMgDl, unit);
  }
  return item.durationMinutes
    ? `${item.label} · ${fill(texts.record.timeline.duration, { count: item.durationMinutes })}`
    : item.label;
}

/** Lignes regroupées par jour (l'ordre reçu, du plus récent au plus ancien, est gardé). */
export function groupByDay(
  items: readonly TimelineItem[],
  now: Date,
): { key: string; label: string; items: TimelineItem[] }[] {
  const days: { key: string; label: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const key = new Date(item.at).toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(item.at, now), items: [item] });
  }
  return days;
}

// ---------- Résumé des analyses ----------

/** Une observation : gravité et type en mots, nombre de mesures qui la justifient. */
export function insightView(insight: InsightDto): {
  severity: string;
  type: string;
  evidence: string | null;
} {
  const count = insight.evidenceIds.length;
  return {
    severity: texts.record.summary.severity[insight.severity],
    type: texts.record.summary.type[insight.type],
    evidence:
      count === 0
        ? null
        : count === 1
          ? texts.record.summary.evidenceOne
          : fill(texts.record.summary.evidence, { count }),
  };
}

// ---------- Erreurs ----------

export type EndReason = 'EXPIRED' | 'REVOKED' | 'APPROVAL' | 'OTHER';
export type RecordProblem =
  { kind: 'ended'; reason: EndReason } | { kind: 'network' } | { kind: 'server' };

/**
 * Réponse refusée ⇒ que montrer. Accès échu ou arrêté, compte plus approuvé, dossier d'un autre médecin ou
 * inconnu : l'accès est TERMINÉ pour cette page (les données déjà reçues sont effacées par l'écran).
 */
export function recordProblem(error: unknown): RecordProblem {
  if (!(error instanceof ApiError)) return { kind: 'server' };
  if (error.status === 0) return { kind: 'network' };
  if (error.status === 403 || error.status === 404) {
    switch (error.code) {
      case 'SESSION_EXPIRED':
        return { kind: 'ended', reason: 'EXPIRED' };
      case 'SESSION_REVOKED':
        return { kind: 'ended', reason: 'REVOKED' };
      case 'DOCTOR_NOT_APPROVED':
        return { kind: 'ended', reason: 'APPROVAL' };
      case 'CATEGORY_NOT_SHARED':
        return { kind: 'server' }; // l'onglet n'aurait pas dû être affiché : on n'invente pas de fin
      default:
        return { kind: 'ended', reason: 'OTHER' };
    }
  }
  return { kind: 'server' };
}
