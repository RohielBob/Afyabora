// Rapport « Préparer ma consultation » (L6-01, CDC F9) : le DOCUMENT PDF, avec @react-pdf/renderer (déjà dans
// les dépendances de l'API). Ce fichier ne calcule rien et n'écrit aucun chiffre lui-même : il met en page
// les textes de report-view.ts.
//  - A4, marges 36 pt, police Plus Jakarta Sans (celle de l'application et du portail, licence OFL, fichiers
//    dans apps/api/assets/fonts) ; pas de coupure de mots (le français coupé au hasard est illisible).
//  - Page 1, la synthèse : identité et période, résumé, qualité des données, répartition, chiffres clés,
//    graphique. Page(s) suivante(s), le détail : points à examiner, épisodes, valeurs inhabituelles, jours
//    sans mesure, avertissement.
//  - Pied de page sur chaque page : nom, « outil d'aide », numéro de page.
//  - Lisible en noir et blanc : chaque état a une forme (▼ ● ▲) ou un mot, jamais la couleur seule.
// Écrit avec React.createElement (alias `h`) plutôt qu'en JSX : l'API compile ses fichiers .ts sans réglage
// JSX particulier, dans le build comme dans les tests.
import { resolve } from 'node:path';
import {
  Circle,
  Document,
  Font,
  G,
  Line,
  Page,
  Path,
  Polygon,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { GlucoseState } from '@glyka/shared';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { brandNavy, brandRed, ink, statePalette, stateSolid } from './report-palette';
import type { ChartPoint, ReportTable, ReportView } from './report-view';

/**
 * `createElement` typé largement : les composants de @react-pdf/renderer sont typés avec les types de React
 * de la RACINE du monorepo (React 19), l'API avec les siens (React 18). À l'exécution, tout est cohérent
 * (vérifié : le PDF est produit et testé) ; seuls les types se contredisent (piège connu, CLAUDE.md §3).
 * Ce contournement reste limité à ce fichier, sans changer aucune dépendance.
 */
const h = createElement as unknown as (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => ReactElement;

/** Polices livrées avec l'API (src et dist sont à la même profondeur : le chemin marche dans les deux cas). */
export const FONT_DIR = resolve(__dirname, '../../../assets/fonts');
const FAMILY = 'PlusJakartaSans';

let fontsReady = false;
function registerFonts(): void {
  if (fontsReady) return;
  Font.register({
    family: FAMILY,
    fonts: [
      { src: resolve(FONT_DIR, 'PlusJakartaSans_400Regular.ttf'), fontWeight: 400 },
      { src: resolve(FONT_DIR, 'PlusJakartaSans_600SemiBold.ttf'), fontWeight: 600 },
      { src: resolve(FONT_DIR, 'PlusJakartaSans_700Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // jamais de mot coupé
  fontsReady = true;
}

const PAGE_WIDTH = 595.28;
const MARGIN = 36;
const CONTENT = PAGE_WIDTH - 2 * MARGIN;

const s = StyleSheet.create({
  page: {
    fontFamily: FAMILY,
    fontSize: 9,
    color: ink.text,
    paddingTop: MARGIN,
    paddingBottom: MARGIN + 18,
    paddingHorizontal: MARGIN,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: brandRed,
    marginBottom: 12,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandName: { fontSize: 15, fontWeight: 700, marginLeft: 6 },
  brandSpace: { fontSize: 6.5, fontWeight: 600, color: ink.muted, letterSpacing: 1, marginLeft: 6 },
  title: { fontSize: 16, fontWeight: 700, textAlign: 'right' },
  subtitle: { fontSize: 9, color: ink.muted, textAlign: 'right' },
  card: {
    borderWidth: 1,
    borderColor: ink.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  muted: { color: ink.muted },
  small: { fontSize: 7.5, color: ink.muted },
  h2: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: 700 },
  row: { flexDirection: 'row' },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: ink.surfaceMuted,
    borderRadius: 5,
    padding: 7,
    marginRight: 6,
  },
  tileLabel: { fontSize: 7.5, color: ink.muted, fontWeight: 600 },
  tileValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 10, fontWeight: 700 },
  th: {
    flexDirection: 'row',
    backgroundColor: ink.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: ink.borderStrong,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: ink.border,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: MARGIN,
    right: MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: ink.subtle,
    borderTopWidth: 0.5,
    borderTopColor: ink.border,
    paddingTop: 5,
  },
  disclaimer: {
    backgroundColor: ink.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: brandNavy,
    padding: 9,
    marginTop: 8,
    fontSize: 8,
    color: ink.muted,
  },
});

// ------------------------------------------------------------------ petits éléments

/** Goutte du logo, en rouge Afyabora. */
function Drop(): ReactElement {
  return h(
    Svg,
    { width: 16, height: 20, viewBox: '0 0 24 30' },
    h(Path, { d: 'M12 1C12 1 2 13 2 19.5a10 10 0 0 0 20 0C22 13 12 1 12 1Z', fill: brandRed }),
  );
}

/** Forme d'un état (graphique et légendes) : ▼ en dessous, ● dans la cible, ▲ au-dessus. */
function stateShape(state: GlucoseState, cx: number, cy: number, size = 2.4): ReactElement {
  const fill = stateSolid(state);
  const strong = state === 'VERY_LOW' || state === 'VERY_HIGH';
  const r = strong ? size * 1.3 : size;
  if (state === 'IN_RANGE') return h(Circle, { cx, cy, r: r * 0.9, fill });
  const up = state === 'HIGH' || state === 'VERY_HIGH';
  const points = up
    ? `${cx},${cy - r * 1.15} ${cx - r},${cy + r * 0.75} ${cx + r},${cy + r * 0.75}`
    : `${cx},${cy + r * 1.15} ${cx - r},${cy - r * 0.75} ${cx + r},${cy - r * 0.75}`;
  return h(Polygon, { points, fill });
}

function LegendShape({ state }: { state: GlucoseState }): ReactElement {
  return h(Svg, { width: 9, height: 9, viewBox: '0 0 9 9' }, stateShape(state, 4.5, 4.5, 3));
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  // D'un seul bloc : jamais un titre seul en bas de page.
  return h(View, { style: s.card, wrap: false }, h(Text, { style: s.h2 }, title), children);
}

/** Barres de qualité (comme l'application) : 3 pleines = bonne, 2 = partielle, 1 = insuffisante. */
function QualityBars({ level }: { level: ReportView['quality']['level'] }): ReactElement {
  const filled = level === 'GOOD' ? 3 : level === 'PARTIAL' ? 2 : 1;
  return h(
    Svg,
    { width: 18, height: 14, viewBox: '0 0 18 14' },
    ...[0, 1, 2].map((i) =>
      h(Rect, {
        key: i,
        x: i * 6,
        y: 10 - i * 4,
        width: 4,
        height: 4 + i * 4,
        rx: 1,
        fill: i < filled ? ink.text : ink.borderStrong,
      }),
    ),
  );
}

// ------------------------------------------------------------------ graphique

const CHART_H = 190;
const PAD_LEFT = 30;
const PAD_BOTTOM = 16;
const PAD_TOP = 6;

function Chart({ chart }: { chart: ReportView['chart'] }): ReactElement {
  const width = CONTENT - 20;
  const plotW = width - PAD_LEFT - 4;
  const plotH = CHART_H - PAD_BOTTOM - PAD_TOP;
  const x = (pos: number) => PAD_LEFT + pos * plotW;
  const y = (value: number) => PAD_TOP + plotH - (Math.min(value, chart.max) / chart.max) * plotH;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  const points: ChartPoint[] = chart.points;
  return h(
    Svg,
    { width, height: CHART_H, viewBox: `0 0 ${width} ${CHART_H}` },
    // Jours sans mesure : zones grisées.
    ...chart.gaps.map((gap, i) =>
      h(Rect, {
        key: `gap-${i}`,
        x: x(gap.from),
        y: PAD_TOP,
        width: Math.max(1, x(gap.to) - x(gap.from)),
        height: plotH,
        fill: ink.surfaceMuted,
      }),
    ),
    // Plage cible du patient.
    h(Rect, {
      x: PAD_LEFT,
      y: y(chart.targetMax),
      width: plotW,
      height: y(chart.targetMin) - y(chart.targetMax),
      fill: statePalette.IN_RANGE.bg,
    }),
    // Graduations des valeurs.
    ...chart.ticks.map((tick) =>
      h(
        G,
        { key: `tick-${tick}` },
        h(Line, {
          x1: PAD_LEFT,
          x2: PAD_LEFT + plotW,
          y1: y(tick),
          y2: y(tick),
          stroke: ink.border,
          strokeWidth: 0.5,
        }),
        h(
          Text,
          {
            x: PAD_LEFT - 4,
            y: y(tick) + 2.5,
            style: { fontSize: 6.5 },
            fill: ink.muted,
            textAnchor: 'end',
          },
          fmt(tick),
        ),
      ),
    ),
    // Seuils « très bas » et « très haut » en pointillés.
    h(Line, {
      x1: PAD_LEFT,
      x2: PAD_LEFT + plotW,
      y1: y(chart.veryLow),
      y2: y(chart.veryLow),
      stroke: statePalette.VERY_LOW.bg,
      strokeWidth: 0.8,
      strokeDasharray: '3,2',
    }),
    h(Line, {
      x1: PAD_LEFT,
      x2: PAD_LEFT + plotW,
      y1: y(chart.veryHigh),
      y2: y(chart.veryHigh),
      stroke: statePalette.VERY_HIGH.bg,
      strokeWidth: 0.8,
      strokeDasharray: '3,2',
    }),
    // Dates.
    ...chart.dates.map((date) =>
      h(
        Text,
        {
          key: `date-${date.label}`,
          x: x(date.x),
          y: CHART_H - 4,
          style: { fontSize: 6.5 },
          fill: ink.muted,
          textAnchor: 'middle',
        },
        date.label,
      ),
    ),
    // Liaison entre les mesures, puis les mesures elles-mêmes (forme + couleur de leur état).
    points.length > 1
      ? h(Polyline, {
          points: points.map((p) => `${x(p.x)},${y(p.value)}`).join(' '),
          stroke: ink.borderStrong,
          strokeWidth: 0.6,
          fill: 'none',
        })
      : null,
    ...points.map((p, i) => h(G, { key: `p-${i}` }, stateShape(p.state, x(p.x), y(p.value)))),
  );
}

function ChartLegend({ unit }: { unit: string }): ReactElement {
  const items: [GlucoseState, string][] = [
    ['VERY_LOW', 'Très bas'],
    ['LOW', 'En dessous'],
    ['IN_RANGE', 'Dans la cible'],
    ['HIGH', 'Au-dessus'],
    ['VERY_HIGH', 'Très haut'],
  ];
  return h(
    View,
    { style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 } },
    ...items.map(([state, label]) =>
      h(
        View,
        { key: state, style: { flexDirection: 'row', alignItems: 'center', marginRight: 10 } },
        h(LegendShape, { state }),
        h(Text, { style: { ...s.small, marginLeft: 3 } }, label),
      ),
    ),
    h(View, {
      style: {
        width: 12,
        height: 7,
        backgroundColor: statePalette.IN_RANGE.bg,
        borderWidth: 0.5,
        borderColor: statePalette.IN_RANGE.border,
      },
    }),
    h(Text, { style: { ...s.small, marginLeft: 3, marginRight: 10 } }, 'Plage cible'),
    h(View, {
      style: {
        width: 12,
        height: 7,
        backgroundColor: ink.surfaceMuted,
        borderWidth: 0.5,
        borderColor: ink.border,
      },
    }),
    h(Text, { style: { ...s.small, marginLeft: 3, marginRight: 10 } }, 'Jour sans mesure'),
    h(Text, { style: s.small }, `Pointillés : seuils très bas et très haut. Valeurs en ${unit}.`),
  );
}

// ------------------------------------------------------------------ répartition

function Distribution({ view }: { view: ReportView }): ReactElement | null {
  const d = view.distribution;
  if (!d) return null;
  const parts: [GlucoseState, string, number][] = [
    ['LOW', 'En dessous', d.below],
    ['IN_RANGE', 'Dans la cible', d.inRange],
    ['HIGH', 'Au-dessus', d.above],
  ];
  return h(
    View,
    null,
    h(
      View,
      {
        style: {
          flexDirection: 'row',
          height: 12,
          borderRadius: 3,
          overflow: 'hidden',
          marginTop: 2,
        },
      },
      ...parts
        .filter(([, , pct]) => pct > 0)
        .map(([state, , pct]) =>
          h(View, { key: state, style: { width: `${pct}%`, backgroundColor: stateSolid(state) } }),
        ),
    ),
    h(
      View,
      { style: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 } },
      ...parts.map(([state, label, pct]) =>
        h(
          View,
          { key: state, style: { flexDirection: 'row', alignItems: 'center' } },
          h(LegendShape, { state }),
          h(Text, { style: { marginLeft: 3, fontSize: 8 } }, label),
          h(Text, { style: { marginLeft: 4, fontSize: 11, fontWeight: 700 } }, `${pct} %`),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ tableaux

/** Largeurs relatives des colonnes (5 colonnes). */
const COLUMNS = [1.3, 1.7, 0.8, 1.3, 1];

function Table({ table }: { table: ReportTable }): ReactElement {
  return h(
    View,
    // Un tableau (12 lignes au plus) reste d'un seul bloc : jamais un titre seul en bas de page.
    { style: s.card, wrap: false },
    h(Text, { style: s.h2 }, table.title),
    h(Text, { style: { ...s.small, marginBottom: 6 } }, table.explanation),
    table.rows.length > 0
      ? h(
          View,
          null,
          h(
            View,
            { style: s.th, fixed: false },
            ...table.headers.map((header, i) =>
              h(
                Text,
                {
                  key: header,
                  style: {
                    flex: COLUMNS[i] ?? 1,
                    fontSize: 7.5,
                    fontWeight: 700,
                    color: ink.muted,
                  },
                },
                header,
              ),
            ),
          ),
          ...table.rows.map((row, r) =>
            h(
              View,
              { key: `r-${r}`, style: s.tr, wrap: false },
              ...row.cells.map((cell, i) =>
                h(
                  Text,
                  {
                    key: `c-${i}`,
                    style: {
                      flex: COLUMNS[i] ?? 1,
                      fontSize: 8.5,
                      fontWeight: row.strong ? 700 : 400,
                    },
                  },
                  cell,
                ),
              ),
            ),
          ),
        )
      : null,
    table.note ? h(Text, { style: { ...s.small, marginTop: 5 } }, table.note) : null,
  );
}

// ------------------------------------------------------------------ document

export function ReportDocument({ view }: { view: ReportView }): ReactElement {
  const footer = h(
    View,
    { style: s.footer, fixed: true },
    h(Text, null, view.footer),
    h(Text, {
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} / ${totalPages}`,
    }),
  );

  const header = h(
    View,
    { style: s.header },
    h(
      View,
      { style: s.brand },
      h(Drop),
      h(
        Text,
        { style: s.brandName },
        h(Text, { style: { color: brandNavy } }, 'Afya'),
        h(Text, { style: { color: brandRed } }, 'bora'),
      ),
    ),
    h(
      View,
      null,
      h(Text, { style: s.title }, view.title),
      h(Text, { style: s.subtitle }, view.subtitle),
    ),
  );

  const identity = h(
    View,
    { style: { ...s.card, flexDirection: 'row', justifyContent: 'space-between' } },
    h(
      View,
      { style: { flex: 1, paddingRight: 12 } },
      h(Text, { style: s.name }, view.patientName),
      h(Text, { style: s.muted }, view.patientDetails),
      h(Text, { style: { marginTop: 4, fontWeight: 600 } }, view.periodText),
    ),
    h(
      View,
      { style: { flex: 1.3 } },
      h(Text, { style: { fontSize: 8 } }, view.targetText),
      h(Text, { style: { ...s.small, marginTop: 3 } }, view.unitText),
      h(Text, { style: { ...s.small, marginTop: 3 } }, view.generatedText),
    ),
  );

  const summary = h(
    View,
    {
      style: {
        backgroundColor: ink.surfaceMuted,
        borderRadius: 6,
        padding: 10,
        marginBottom: 10,
      },
    },
    h(Text, { style: { ...s.h2, marginBottom: 3 } }, 'En bref'),
    h(Text, null, view.summary),
  );

  const qualityAndDistribution = h(
    View,
    { style: { flexDirection: 'row', marginBottom: 0 } },
    h(
      View,
      { style: { ...s.card, flex: 1, marginRight: 8 } },
      h(Text, { style: s.h2 }, 'Qualité des données'),
      h(
        View,
        { style: { flexDirection: 'row', alignItems: 'flex-end' } },
        h(Text, { style: { fontSize: 22, fontWeight: 700 } }, String(view.quality.score)),
        h(Text, { style: { fontSize: 10, color: ink.muted, marginBottom: 3 } }, '/100'),
        h(
          View,
          { style: { marginLeft: 8, marginBottom: 4 } },
          h(QualityBars, { level: view.quality.level }),
        ),
        h(
          Text,
          { style: { marginLeft: 4, marginBottom: 3, fontWeight: 700 } },
          view.quality.levelText,
        ),
      ),
      ...view.quality.lines.map((line, i) =>
        h(Text, { key: `q-${i}`, style: { ...s.small, marginTop: 2 } }, line),
      ),
    ),
    h(
      View,
      { style: { ...s.card, flex: 1.3 } },
      h(Text, { style: s.h2 }, 'Répartition des mesures'),
      view.distribution
        ? h(Distribution, { view })
        : h(Text, { style: s.muted }, view.insufficient ?? ''),
      view.comparisonText
        ? h(Text, { style: { ...s.small, marginTop: 6 } }, view.comparisonText)
        : null,
    ),
  );

  const keyFigures =
    view.keyFigures.length > 0
      ? h(
          View,
          { style: { flexDirection: 'row', marginBottom: 10 } },
          ...view.keyFigures.map((figure, i) =>
            h(
              View,
              {
                key: figure.label,
                style: { ...s.tile, marginRight: i === view.keyFigures.length - 1 ? 0 : 6 },
              },
              h(Text, { style: s.tileLabel }, figure.label),
              h(Text, { style: s.tileValue }, figure.value),
            ),
          ),
        )
      : null;

  const chart = h(
    View,
    { style: s.card, wrap: false },
    h(Text, { style: s.h2 }, 'Glycémies de la période'),
    h(Chart, { chart: view.chart }),
    h(ChartLegend, { unit: view.chart.unit }),
  );

  const points = h(
    Section,
    { title: 'Points à examiner avec le professionnel de santé' },
    view.points.length > 0
      ? h(
          View,
          null,
          ...view.points.map((point, i) =>
            h(
              View,
              { key: `pt-${i}`, style: s.bullet },
              h(Text, { style: s.bulletDot }, '•'),
              h(Text, { style: { flex: 1 } }, point),
            ),
          ),
        )
      : h(
          Text,
          { style: s.muted },
          "Aucun point particulier relevé par l'analyse sur cette période.",
        ),
  );

  const missing = h(Section, { title: 'Jours sans mesure' }, h(Text, null, view.missingDaysText));

  return h(
    Document,
    {
      title: `${view.title} · ${view.patientName}`,
      author: 'Afyabora',
      subject: view.subtitle,
      creator: 'Afyabora',
      producer: 'Afyabora',
      language: 'fr-FR',
    },
    h(
      Page,
      { size: 'A4', style: s.page },
      header,
      identity,
      summary,
      qualityAndDistribution,
      keyFigures,
      chart,
      footer,
    ),
    h(
      Page,
      { size: 'A4', style: s.page },
      points,
      h(Table, { table: view.episodesBelow }),
      h(Table, { table: view.episodesAbove }),
      h(Table, { table: view.unusual }),
      missing,
      h(View, { style: s.disclaimer, wrap: false }, h(Text, null, view.disclaimer)),
      footer,
    ),
  );
}

/**
 * Typographie française : espace insécable devant « : ; % ? ! » et après « « » (et avant « » »), pour qu'un
 * signe ne commence jamais une ligne (« Très haut / : au-dessus » devient impossible).
 */
export function frenchSpacing(text: string): string {
  return (
    text
      .replace(/ ([:;%?!»])/g, '\u00a0$1')
      .replace(/« /g, '«\u00a0')
      // Pas de ligature « ff », « fi », « fl » : sinon le texte COPIÉ du PDF perd une lettre
      // (« diférente »). Un antiliant invisible (U+200C) les empêche ; l'impression ne change pas.
      .replace(/f(?=[fil])/g, 'f\u200c')
  );
}

/** Tous les textes de la vue, avec la typographie française (récursif). */
function typeset<T>(value: T): T {
  if (typeof value === 'string') return frenchSpacing(value) as T;
  if (Array.isArray(value)) return value.map(typeset) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeset(v)])) as T;
  }
  return value;
}

/** Le PDF, en mémoire. */
export async function renderReportPdf(plain: ReportView): Promise<Buffer> {
  registerFonts();
  const view = typeset(plain);
  return renderToBuffer(
    h(ReportDocument, { view }) as unknown as Parameters<typeof renderToBuffer>[0],
  );
}
