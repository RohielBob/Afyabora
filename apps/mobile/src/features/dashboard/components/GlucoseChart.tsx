// Graphique d'évolution (L2-06, CDC F3) : « avec la plage cible en bande, points tapables pour voir le
// détail ». Dessiné avec react-native-svg (déjà dans le projet), animé avec reanimated.
//  - bande verte douce = plage cible du patient ; lignes pointillées = graduations rondes dans son unité ;
//  - chaque mesure a une FORME selon son état (● dans la plage, ▲ au-dessus, ▼ en dessous ; plus grande
//    pour très haut / très bas) et sa couleur : l'état n'est jamais dit par la couleur seule ;
//  - la courbe se dessine de gauche à droite (≈ 0,4 s), puis les points apparaissent en fondu ; changer de
//    période redessine. « Réduire les animations » : tout s'affiche directement ;
//  - la période est choisie par l'écran (partagée avec les statistiques, L2-07) ;
//  - toucher ou glisser le doigt sur le graphique sélectionne la mesure la plus proche : trait vertical,
//    point entouré, détail au-dessus (valeur, état, contexte, jour et heure). Lecteur d'écran : balayer
//    vers le haut / le bas passe d'une mesure à l'autre ;
//  - la courbe est coupée après 2 jours sans mesure (on n'invente pas de tendance).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import {
  classifyGlucose,
  type GlucoseState,
  type GlucoseThresholds,
  type GlucoseUnit,
} from '@glyka/shared';
import { Card, RangeBadge, SegmentedControl, Text } from '@/components/ui';
import { formatClock, formatReading } from '@/features/measurements';
import { durations, easing, radii, spacing, useReducedMotion, useTheme } from '@/theme';
import {
  CHART_PERIODS,
  DENSE_POINTS,
  nearestIndex,
  periodBounds,
  pointsIn,
  polyline,
  segments,
  xTicks,
  yScale,
  type ChartPeriod,
  type ChartPoint,
} from '../chart';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Zone de dessin : hauteur fixe ; marges pour les graduations (à gauche) et les dates (en bas). */
const HEIGHT = 200;
const PAD = { left: 40, right: 10, top: 12, bottom: 26 };
/** Largeur d'une étiquette de date : étroite pour « lun. » (7 jours), plus large pour « 12 sept. ». */
const xLabelWidth = (period: ChartPeriod) => (period === 7 ? 34 : 56);

type StateColors = Record<GlucoseState, { fg: string; bg: string; border: string }>;

/** Couleur d'une mesure : pleine pour les états extrêmes, encre de l'état sinon (jamais le rouge marque). */
function stateColor(states: StateColors, state: GlucoseState): string {
  return state === 'VERY_LOW' || state === 'VERY_HIGH' ? states[state].bg : states[state].fg;
}

/** Forme d'une mesure : rond (dans la plage), triangle vers le haut (au-dessus) ou vers le bas (en dessous). */
function Marker({
  x,
  y,
  state,
  color,
  outline,
  big = false,
  small = false,
}: {
  x: number;
  y: number;
  state: GlucoseState;
  color: string;
  outline: string;
  big?: boolean;
  /** Beaucoup de mesures (ex. 90 jours) : points plus petits, sans contour épais. */
  small?: boolean;
}) {
  const extreme = state === 'VERY_LOW' || state === 'VERY_HIGH';
  const r = (big ? 6 : small ? 2.4 : 3.6) + (extreme ? 1 : 0);
  const strokeWidth = small && !big ? 0.8 : 1.5;
  if (state === 'IN_RANGE') {
    return <Circle cx={x} cy={y} r={r} fill={color} stroke={outline} strokeWidth={strokeWidth} />;
  }
  const up = state === 'HIGH' || state === 'VERY_HIGH';
  const h = r * 1.15;
  const d = up
    ? `M${x} ${y - h}L${x + h} ${y + h * 0.75}L${x - h} ${y + h * 0.75}Z`
    : `M${x} ${y + h}L${x + h} ${y - h * 0.75}L${x - h} ${y - h * 0.75}Z`;
  return (
    <Path d={d} fill={color} stroke={outline} strokeWidth={strokeWidth} strokeLinejoin="round" />
  );
}

export function GlucoseChart({
  points,
  thresholds,
  unit,
  now,
  period,
  onPeriodChange,
  index = 0,
}: {
  /** Mesures (au moins celles des 90 derniers jours), dans n'importe quel ordre. */
  points: readonly ChartPoint[];
  /** Période affichée, choisie par l'écran : changer de période met à jour TOUS les chiffres (CDC F3). */
  period: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  thresholds: GlucoseThresholds;
  unit: GlucoseUnit;
  now: Date;
  index?: number;
}) {
  const { t, i18n } = useTranslation();
  const { colors, states } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(-1);
  const touchStart = useRef({ x: 0, y: 0 });

  const bounds = useMemo(() => periodBounds(period, now), [period, now]);
  const visible = useMemo(() => pointsIn(points, bounds), [points, bounds]);
  const scale = useMemo(
    () =>
      yScale(
        visible.map((p) => p.mgDl),
        thresholds,
        unit,
      ),
    [visible, thresholds, unit],
  );

  const innerWidth = Math.max(0, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const xOf = (time: number) =>
    PAD.left + ((time - bounds.from) / (bounds.to - bounds.from)) * innerWidth;
  const yOf = (mgDl: number) =>
    PAD.top + (1 - (mgDl - scale.minMgDl) / (scale.maxMgDl - scale.minMgDl)) * innerHeight;

  const xs = visible.map((p) => xOf(p.at));
  const lines = segments(visible).map((part) =>
    polyline(part.map((p) => ({ x: xOf(p.at), y: yOf(p.mgDl) }))),
  );
  const path = lines.map((l) => l.d).join('');
  const length = lines.reduce((sum, l) => sum + l.length, 0);

  // Dessin progressif : la courbe se trace, puis les points apparaissent. Relancé quand la période, la
  // largeur ou les données changent.
  const draw = useSharedValue(reduced ? 1 : 0);
  const dots = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (width === 0) return;
    if (reduced) {
      draw.value = 1;
      dots.value = 1;
      return;
    }
    draw.value = 0;
    dots.value = 0;
    draw.value = withTiming(1, { duration: durations.slow, easing: easing.standard });
    dots.value = withDelay(durations.fast, withTiming(1, { duration: durations.base }));
  }, [period, width, visible.length, unit, reduced, draw, dots]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));
  const dotsProps = useAnimatedProps(() => ({ opacity: dots.value }));

  const pick = (x: number) => {
    const i = nearestIndex(xs, x);
    if (i >= 0 && i !== selected) setSelected(i);
  };

  const choosePeriod = (next: ChartPeriod) => {
    onPeriodChange(next);
    setSelected(-1);
  };

  const current = selected >= 0 ? visible[selected] : undefined;
  const describe = (p: ChartPoint) => {
    const date = new Date(p.at);
    const day = date.toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return {
      value: formatReading(p.mgDl, unit),
      state: classifyGlucose(p.mgDl, thresholds),
      detail: `${t(`measurement.context.${p.context}`)} · ${day}, ${formatClock(date.getHours(), date.getMinutes())}`,
    };
  };
  const currentInfo = current ? describe(current) : null;

  // 7 jours : « lun. » ; au-delà : « 3 oct. ».
  const tickLabel = (time: number) =>
    new Date(time).toLocaleDateString(
      i18n.language,
      period === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' },
    );
  const ticks = xTicks(period, bounds);
  const labelWidth = xLabelWidth(period);
  // 7 jours : l'étiquette est centrée sur la journée (midi) ; sinon sur le repère du jour (minuit).
  const tickX = (time: number) => xOf(period === 7 ? time + 12 * 3_600_000 : time);

  const targetTop = yOf(thresholds.targetMaxMgDl);
  const targetBottom = yOf(thresholds.targetMinMgDl);
  const outline = colors.surface;
  const dense = visible.length > DENSE_POINTS;

  return (
    <Card variant="outlined" index={index} style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" tone="muted" accessibilityRole="header">
          {t('dashboard.chart.title')}
        </Text>
        <SegmentedControl<`${ChartPeriod}`>
          accessibilityLabel={t('dashboard.chart.periodLabel')}
          value={`${period}`}
          onChange={(value) => choosePeriod(Number(value) as ChartPeriod)}
          options={CHART_PERIODS.map((days) => ({
            value: `${days}` as `${ChartPeriod}`,
            label: t('dashboard.chart.period', { count: days }),
          }))}
        />
      </View>

      {/* Détail de la mesure touchée, ou résumé de la période. Hauteur fixe : rien ne saute. */}
      <View style={{ minHeight: 48, justifyContent: 'center' }} accessibilityLiveRegion="polite">
        {currentInfo && current ? (
          <Animated.View
            key={current.id}
            entering={reduced ? undefined : FadeIn.duration(durations.fast)}
            style={{ gap: 2 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>
                {currentInfo.value}
              </Text>
              <RangeBadge state={currentInfo.state} size="sm" />
            </View>
            <Text variant="caption" tone="muted">
              {currentInfo.detail}
            </Text>
          </Animated.View>
        ) : (
          <View style={{ gap: 2 }}>
            <Text variant="label">
              {t('dashboard.chart.summary', { count: visible.length, days: period })}
            </Text>
            {visible.length ? (
              <Text variant="caption" tone="muted">
                {t('dashboard.chart.hint')}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
        // Toucher / glisser : la mesure la plus proche du doigt. Si le geste part surtout vers le haut ou le
        // bas, on laisse l'écran défiler.
        onStartShouldSetResponder={() => visible.length > 0}
        onMoveShouldSetResponder={() => visible.length > 0}
        onResponderGrant={(e: GestureResponderEvent) => {
          touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          pick(e.nativeEvent.locationX);
        }}
        onResponderMove={(e: GestureResponderEvent) => pick(e.nativeEvent.locationX)}
        onResponderTerminationRequest={(e: GestureResponderEvent) =>
          Math.abs(e.nativeEvent.pageY - touchStart.current.y) >
          Math.abs(e.nativeEvent.pageX - touchStart.current.x)
        }
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('dashboard.chart.a11y', { count: visible.length, days: period })}
        accessibilityHint={visible.length ? t('dashboard.chart.a11yHint') : undefined}
        accessibilityValue={
          currentInfo
            ? {
                text: t('dashboard.chart.a11yPoint', {
                  value: currentInfo.value,
                  state: t(`glucose.state.${currentInfo.state}`),
                  detail: currentInfo.detail,
                }),
              }
            : undefined
        }
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (!visible.length) return;
          const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          const start = selected < 0 ? (step > 0 ? -1 : visible.length) : selected;
          setSelected(Math.min(visible.length - 1, Math.max(0, start + step)));
        }}
        style={{ height: HEIGHT }}
      >
        {width > 0 ? (
          <>
            {/* Le dessin ne capte pas les touchers : c'est le cadre qui les reçoit (coordonnées fiables). */}
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
              <Svg width={width} height={HEIGHT}>
                {/* Plage cible */}
                <Rect
                  x={PAD.left}
                  y={targetTop}
                  width={innerWidth}
                  height={Math.max(0, targetBottom - targetTop)}
                  fill={states.IN_RANGE.bg}
                  opacity={0.8}
                  rx={radii.sm / 2}
                />
                {[targetTop, targetBottom].map((y) => (
                  <Line
                    key={y}
                    x1={PAD.left}
                    x2={PAD.left + innerWidth}
                    y1={y}
                    y2={y}
                    stroke={states.IN_RANGE.border}
                    strokeWidth={1}
                  />
                ))}
                {/* Graduations horizontales */}
                {scale.ticks.map((tick) => (
                  <Line
                    key={tick.mgDl}
                    x1={PAD.left}
                    x2={PAD.left + innerWidth}
                    y1={yOf(tick.mgDl)}
                    y2={yOf(tick.mgDl)}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                ))}
                {/* Repères des jours */}
                {ticks.map((tick) => (
                  <Line
                    key={tick}
                    x1={xOf(tick)}
                    x2={xOf(tick)}
                    y1={PAD.top + innerHeight}
                    y2={PAD.top + innerHeight + 4}
                    stroke={colors.borderStrong}
                    strokeWidth={1}
                  />
                ))}
                {/* Courbe (dessinée progressivement) */}
                {length > 0 ? (
                  <AnimatedPath
                    d={path}
                    fill="none"
                    stroke={colors.textMuted}
                    strokeWidth={dense ? 1.25 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${length} ${length}`}
                    animatedProps={lineProps}
                  />
                ) : null}
                {/* Curseur de la mesure touchée */}
                {current ? (
                  <Line
                    x1={xOf(current.at)}
                    x2={xOf(current.at)}
                    y1={PAD.top}
                    y2={PAD.top + innerHeight}
                    stroke={colors.borderStrong}
                    strokeWidth={1}
                  />
                ) : null}
                {/* Mesures (forme + couleur de l'état) */}
                <AnimatedG animatedProps={dotsProps}>
                  {visible.map((p, i) => {
                    const state = classifyGlucose(p.mgDl, thresholds);
                    return (
                      <Marker
                        key={p.id}
                        x={xs[i] as number}
                        y={yOf(p.mgDl)}
                        state={state}
                        color={stateColor(states, state)}
                        outline={outline}
                        big={i === selected}
                        small={dense}
                      />
                    );
                  })}
                </AnimatedG>
              </Svg>

              {/* Graduations (texte de l'app : police et couleurs du thème) */}
              {scale.ticks.map((tick) => (
                <Text
                  key={tick.mgDl}
                  variant="caption"
                  tone="muted"
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: PAD.left - 6,
                    top: yOf(tick.mgDl) - 8,
                    textAlign: 'right',
                    fontSize: 10,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {tick.label}
                </Text>
              ))}
              {ticks.map((tick) => (
                <Text
                  key={tick}
                  variant="caption"
                  tone="muted"
                  numberOfLines={1}
                  style={{
                    position: 'absolute',
                    top: PAD.top + innerHeight + 7,
                    left: Math.min(
                      Math.max(tickX(tick) - labelWidth / 2, PAD.left - 12),
                      width - labelWidth,
                    ),
                    width: labelWidth,
                    textAlign: 'center',
                    fontSize: 10,
                  }}
                >
                  {tickLabel(tick)}
                </Text>
              ))}

              {visible.length === 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: PAD.left,
                    right: PAD.right,
                    top: PAD.top,
                    bottom: PAD.bottom,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="bodySmall" tone="muted" align="center">
                    {t('dashboard.chart.empty', { days: period })}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      {/* Légende : la bande et les trois formes, avec leurs mots. */}
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 18,
              height: 10,
              borderRadius: 3,
              backgroundColor: states.IN_RANGE.bg,
              borderWidth: 1,
              borderColor: states.IN_RANGE.border,
            }}
          />
          <Text variant="caption" tone="muted">
            {t('dashboard.chart.target', {
              min: formatReading(thresholds.targetMinMgDl, unit),
              max: formatReading(thresholds.targetMaxMgDl, unit),
            })}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          <Text variant="caption" style={{ color: stateColor(states, 'HIGH') }}>
            ▲
          </Text>{' '}
          {t('glucose.state.HIGH')} ·{' '}
          <Text variant="caption" style={{ color: stateColor(states, 'IN_RANGE') }}>
            ●
          </Text>{' '}
          {t('glucose.state.IN_RANGE')} ·{' '}
          <Text variant="caption" style={{ color: stateColor(states, 'LOW') }}>
            ▼
          </Text>{' '}
          {t('glucose.state.LOW')}
        </Text>
      </View>
    </Card>
  );
}
