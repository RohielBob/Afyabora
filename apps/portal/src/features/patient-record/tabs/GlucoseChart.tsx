// Graphique des glycémies (L5-12, CDC F8 « graphique interactif ») avec recharts (déjà dans les dépendances
// du portail). Chargé SEULEMENT quand l'onglet « Glycémie » s'ouvre (import dynamique dans GlucoseTab) :
// le reste du portail ne télécharge pas la bibliothèque.
//  - Bande de la plage cible DU PATIENT, lignes pointillées « très bas » et « très haut ».
//  - Chaque point a la FORME de son état (▼ bas, ● dans la plage, ▲ haut ; plein et plus grand si « très »)
//    et sa couleur (palette des états, jamais rouge) ; au survol : date, valeur, état en mots, moment.
//  - Le graphique est une image pour les lecteurs d'écran (role="img" + phrase) : le tableau sous le
//    graphique donne chaque valeur en texte.
import type { GlucoseState, GlucoseUnit, MeasurementDto } from '@glyka/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GlucoseStateBadge } from '@/components/ui';
import { fill, fr } from '@/i18n/fr';
import { dateTimeText, valueIn, valueText } from '../view';

/** Écart entre deux graduations de l'axe des valeurs, selon l'unité. */
const TICK_STEP: Record<GlucoseUnit, number> = { G_L: 0.5, MG_DL: 50, MMOL_L: 3 };

export interface ChartPoint {
  t: number;
  v: number;
  mgDl: number;
  state: GlucoseState;
  context: MeasurementDto['context'];
}

/** Couleurs d'un état, en variables CSS (clair / sombre). */
const color = (state: GlucoseState, part: 'fg' | 'bg' | 'border') =>
  `var(--afy-state-${state.toLowerCase().replace(/_/g, '-')}-${part})`;

/** Point en forme d'état : triangle vers le bas, rond, triangle vers le haut. */
function StateDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const { state } = payload;
  const strong = state === 'VERY_LOW' || state === 'VERY_HIGH';
  const r = strong ? 5.5 : 4.5;
  const style = {
    fill: strong ? color(state, 'bg') : color(state, 'fg'),
    stroke: 'var(--afy-surface)',
    strokeWidth: 1.5,
  };
  if (state === 'IN_RANGE') return <circle cx={cx} cy={cy} r={r - 0.5} style={style} />;
  const up = state === 'HIGH' || state === 'VERY_HIGH';
  const h = r * 1.8;
  const points = up
    ? `${cx},${cy - h / 1.6} ${cx - r},${cy + h / 2.6} ${cx + r},${cy + h / 2.6}`
    : `${cx},${cy + h / 1.6} ${cx - r},${cy - h / 2.6} ${cx + r},${cy - h / 2.6}`;
  return <polygon points={points} style={style} />;
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  unit: GlucoseUnit;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised px-3 py-2 text-[13px] shadow-[0_8px_24px_-12px_rgb(16_19_24/0.35)]">
      <span className="text-muted">{dateTimeText(new Date(point.t).toISOString())}</span>
      <span className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-ink tabular-nums">
          {valueText(point.mgDl, unit)}
        </span>
        <GlucoseStateBadge state={point.state} />
      </span>
      <span className="text-muted">{fr.record.contexts[point.context]}</span>
    </div>
  );
}

export default function GlucoseChart({
  points,
  unit,
  thresholds,
  from,
  to,
}: {
  points: ChartPoint[];
  unit: GlucoseUnit;
  thresholds: {
    veryLowMgDl: number;
    targetMinMgDl: number;
    targetMaxMgDl: number;
    veryHighMgDl: number;
  };
  from: number;
  to: number;
}) {
  // Graduations rondes dans l'unité choisie (0,5 g/L ; 50 mg/dL ; 3 mmol/L), jusqu'au-dessus du plus haut point.
  const step = TICK_STEP[unit];
  const top = Math.max(valueIn(thresholds.veryHighMgDl, unit), ...points.map((p) => p.v));
  const ticks = Array.from(
    { length: Math.ceil(top / step) + 1 },
    (_, i) => Math.round(i * step * 10) / 10,
  );
  const yMax = ticks[ticks.length - 1] ?? step;
  const days = (to - from) / 86_400_000;
  const tick = (t: number) =>
    new Date(t).toLocaleDateString(
      'fr-FR',
      days <= 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' },
    );
  return (
    <div
      role="img"
      aria-label={fill(fr.record.glucose.chartA11y, {
        count: points.length,
        min: valueText(thresholds.targetMinMgDl, unit, false),
        max: valueText(thresholds.targetMaxMgDl, unit),
      })}
      className="h-[320px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--afy-border)" strokeDasharray="3 4" vertical={false} />
          <ReferenceArea
            y1={valueIn(thresholds.targetMinMgDl, unit)}
            y2={valueIn(thresholds.targetMaxMgDl, unit)}
            ifOverflow="extendDomain"
            style={{ fill: color('IN_RANGE', 'bg'), fillOpacity: 0.9 }}
            stroke="none"
          />
          <ReferenceLine
            y={valueIn(thresholds.veryLowMgDl, unit)}
            style={{ stroke: color('VERY_LOW', 'bg') }}
            strokeDasharray="5 4"
          />
          <ReferenceLine
            y={valueIn(thresholds.veryHighMgDl, unit)}
            style={{ stroke: color('VERY_HIGH', 'bg') }}
            strokeDasharray="5 4"
          />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[from, to]}
            tickFormatter={tick}
            tick={{ fill: 'var(--afy-text-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--afy-border)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            dataKey="v"
            domain={[0, yMax]}
            ticks={ticks}
            tick={{ fill: 'var(--afy-text-muted)', fontSize: 12 }}
            tickFormatter={(v: number) => v.toLocaleString('fr-FR')}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} />}
            cursor={{ stroke: 'var(--afy-border-strong)', strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="v"
            stroke="var(--afy-border-strong)"
            strokeWidth={1.5}
            dot={<StateDot />}
            activeDot={<StateDot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
