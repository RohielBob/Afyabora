// Onglet « Glycémie » (L5-12) : graphique de la période, puis le tableau de toutes les mesures (valeur dans
// l'unité choisie, état en symbole + mot, moment, provenance, note si le patient a partagé ses notes).
// Le serveur n'envoie que les mesures non supprimées, et la note seulement si elle est partagée.
import {
  classifyGlucose,
  type DoctorSummary,
  type GlucoseUnit,
  type MeasurementDto,
} from '@glyka/shared';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Button, GlucoseStateBadge, ProvenanceBadge, Spinner } from '@/components/ui';
import { fill, texts } from '@/i18n';
import { dateTimeText, valueIn, valueText } from '../view';
import type { ChartPoint } from './GlucoseChart';

const GlucoseChart = lazy(() => import('./GlucoseChart'));

/** Lignes du tableau affichées d'abord, puis par paquets (« Afficher plus »). */
export const TABLE_STEP = 100;

const t = texts.record.glucose;

export function GlucoseTab({
  summary,
  measurements,
  truncated,
  unit,
  from,
  to,
}: {
  summary: DoctorSummary;
  measurements: MeasurementDto[];
  truncated: boolean;
  unit: GlucoseUnit;
  from: number;
  to: number;
}) {
  const [shown, setShown] = useState(TABLE_STEP);
  const thresholds = summary.patient.thresholds;
  const withNotes = summary.session.categories.includes('PERSONAL_NOTES');
  // Le graphique va du plus ancien au plus récent ; l'état suit les seuils DU patient.
  const points = useMemo<ChartPoint[]>(
    () =>
      [...measurements].reverse().map((m) => ({
        t: Date.parse(m.measuredAt),
        v: valueIn(m.valueMgDl, unit),
        mgDl: m.valueMgDl,
        state: classifyGlucose(m.valueMgDl, thresholds),
        context: m.context,
      })),
    [measurements, unit, thresholds],
  );

  if (measurements.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-[14px] text-muted">
        {t.empty}
      </p>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-ink">{t.chartTitle}</h2>
          <span className="inline-flex items-center gap-2 text-[12px] text-muted">
            <span
              aria-hidden="true"
              className="h-3 w-5 rounded-sm bg-state-in-range-bg ring-1 ring-state-in-range-border"
            />
            {t.target} : {valueText(thresholds.targetMinMgDl, unit, false)} –{' '}
            {valueText(thresholds.targetMaxMgDl, unit)}
          </span>
        </div>
        <Suspense
          fallback={
            <div className="flex h-[320px] items-center justify-center">
              <Spinner size={22} />
            </div>
          }
        >
          <GlucoseChart points={points} unit={unit} thresholds={thresholds} from={from} to={to} />
        </Suspense>
        {truncated ? (
          <p className="text-[13px] text-muted">{fill(t.more, { count: measurements.length })}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold text-ink">{t.table}</h2>
          <span className="text-[13px] text-muted">
            {fill(t.shown, {
              shown: Math.min(shown, measurements.length),
              total: measurements.length,
            })}
          </span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted text-[12px] text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  {t.when}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  {t.value}
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  {t.state}
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  {t.context}
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  {t.source}
                </th>
                {withNotes ? (
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    {t.note}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {measurements.slice(0, shown).map((m) => (
                <tr key={m.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                    {dateTimeText(m.measuredAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-ink tabular-nums">
                    {valueText(m.valueMgDl, unit)}
                  </td>
                  <td className="px-4 py-2.5">
                    <GlucoseStateBadge state={classifyGlucose(m.valueMgDl, thresholds)} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">{texts.record.contexts[m.context]}</td>
                  <td className="px-4 py-2.5">
                    <ProvenanceBadge source={m.source} importBatchId={m.importBatchId} />
                  </td>
                  {withNotes ? (
                    <td className="max-w-[260px] px-4 py-2.5 text-muted">{m.note ?? t.noNote}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown < measurements.length ? (
          <Button
            variant="outline"
            fullWidth={false}
            className="self-center"
            onClick={() => setShown((n) => n + TABLE_STEP)}
          >
            {t.showMore}
          </Button>
        ) : null}
      </section>
    </>
  );
}
