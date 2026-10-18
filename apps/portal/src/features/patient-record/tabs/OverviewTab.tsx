// Vue d'ensemble du dossier (L5-12, onglet « Identité & diabète » du CDC F8) : qualité des données, chiffres
// des 30 derniers jours, seuils personnels du patient, ce qui est partagé. Tous les nombres viennent du
// serveur (@glyka/analytics, même calcul que l'application du patient) ; l'écran ne fait que les montrer.
import type { DoctorSummary, GlucoseState, GlucoseUnit, RangeStatsDto } from '@glyka/shared';
import type { ReactNode } from 'react';
import { GlucoseStateBadge } from '@/components/ui';
import { QUALITY_TONE, QualityIcon } from '@/features/sessions/SessionCard';
import { qualityView } from '@/features/sessions/view';
import { fill, fr } from '@/i18n/fr';
import { decimal, orderedCategories, valueText } from '../view';

const t = fr.record.overview;

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold text-ink">{title}</h2>
        {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Barre de 0 à 100 avec sa valeur. */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-ink tabular-nums">{value}/100</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="transition-afy h-full rounded-full bg-ink/70"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

/** Vrai si le patient a partagé ses glycémies ou le résumé : sinon, aucun chiffre glycémique à montrer. */
const analysisShared = (summary: DoctorSummary) =>
  summary.session.categories.includes('GLUCOSE_HISTORY') ||
  summary.session.categories.includes('AI_SUMMARY');

function QualityCard({ quality, shared }: { quality: DoctorSummary['quality']; shared: boolean }) {
  const view = qualityView(quality.level, quality.score);
  // Non partagé : le serveur renvoie une qualité calculée sur zéro mesure. « 0/100 » ferait croire que le
  // patient ne mesure jamais ; on dit plutôt que ces données ne sont pas partagées.
  if (!shared) {
    return (
      <Card title={t.quality}>
        <p className="text-[14px] text-muted">{t.notShared}</p>
      </Card>
    );
  }
  return (
    <Card title={t.quality} hint={t.qualityHint}>
      <div className="flex items-end gap-4">
        <span className="text-[40px] leading-none font-bold tracking-[-1px] text-ink tabular-nums">
          {quality.score}
          <span className="text-[18px] font-semibold text-muted">/100</span>
        </span>
        <span
          role="img"
          aria-label={view.a11y}
          className={`mb-1 inline-flex items-center gap-1.5 text-[14px] font-semibold ${QUALITY_TONE[quality.level]}`}
        >
          <QualityIcon level={quality.level} />
          {view.label}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <Meter label={t.coverage} value={quality.coverage} />
        <Meter label={t.density} value={quality.density} />
        <Meter label={t.freshness} value={quality.freshness} />
      </div>
      <p className="text-[13px] text-muted">
        {fill(t.daysWithData, { days: quality.daysWithData, total: quality.daysInPeriod })}
      </p>
    </Card>
  );
}

/** Couleur pleine de chaque part de la barre (palette des états, écrite en entier pour Tailwind). */
const SEGMENT: Partial<Record<GlucoseState, string>> = {
  LOW: 'bg-state-low-fg',
  IN_RANGE: 'bg-state-in-range-fg',
  HIGH: 'bg-state-high-fg',
};

/** Répartition dans la plage / au-dessus / en dessous : barre empilée + légende (symbole + mot + %). */
function Distribution({ stats }: { stats: RangeStatsDto }) {
  const parts: { state: GlucoseState; label: string; pct: number }[] = [
    { state: 'LOW', label: t.below, pct: stats.timeBelowPct ?? 0 },
    { state: 'IN_RANGE', label: t.inRange, pct: stats.timeInRangePct ?? 0 },
    { state: 'HIGH', label: t.above, pct: stats.timeAbovePct ?? 0 },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={fill(t.distributionA11y, {
          inRange: decimal(stats.timeInRangePct ?? 0),
          above: decimal(stats.timeAbovePct ?? 0),
          below: decimal(stats.timeBelowPct ?? 0),
        })}
        className="flex h-3 overflow-hidden rounded-full bg-surface-muted"
      >
        {parts.map((part) =>
          part.pct > 0 ? (
            <div
              key={part.state}
              className={`h-full border-r-2 border-r-surface last:border-r-0 ${SEGMENT[part.state]}`}
              style={{ width: `${part.pct}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-hidden="true">
        {parts.map((part) => (
          <li key={part.state} className="flex items-center justify-between gap-2 text-[13px]">
            <GlucoseStateBadge state={part.state} />
            <span className="font-semibold text-ink tabular-nums">{decimal(part.pct)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsCard({ summary, unit }: { summary: DoctorSummary; unit: GlucoseUnit }) {
  const { stats } = summary;
  const tiles = stats
    ? [
        { label: t.count, value: String(stats.count) },
        { label: t.mean, value: stats.meanMgDl === null ? '—' : valueText(stats.meanMgDl, unit) },
        { label: t.sd, value: stats.sdMgDl === null ? '—' : valueText(stats.sdMgDl, unit) },
        { label: t.cv, value: stats.cvPercent === null ? '—' : `${decimal(stats.cvPercent)} %` },
      ]
    : [];
  return (
    <Card title={t.stats}>
      {stats ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="flex flex-col gap-1 rounded-xl bg-surface-muted p-3">
                <dt className="text-[12px] font-semibold text-muted">{tile.label}</dt>
                <dd className="text-[18px] font-bold text-ink tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>
          <Distribution stats={stats} />
        </>
      ) : (
        <p className="text-[14px] text-muted">
          {analysisShared(summary) ? t.notEnough : t.notShared}
        </p>
      )}
    </Card>
  );
}

function ThresholdsCard({ summary, unit }: { summary: DoctorSummary; unit: GlucoseUnit }) {
  const th = summary.patient.thresholds;
  const rows: { state: GlucoseState; label: string; value: string }[] = [
    { state: 'VERY_LOW', label: t.veryLow, value: valueText(th.veryLowMgDl, unit) },
    {
      state: 'IN_RANGE',
      label: t.target,
      value: fill(t.targetRange, {
        min: valueText(th.targetMinMgDl, unit, false),
        max: valueText(th.targetMaxMgDl, unit),
      }),
    },
    { state: 'VERY_HIGH', label: t.veryHigh, value: valueText(th.veryHighMgDl, unit) },
  ];
  return (
    <Card title={t.thresholds} hint={t.thresholdsHint}>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div key={row.state} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex items-center gap-2 text-[14px] text-muted">
              <GlucoseStateBadge state={row.state} compact />
              {row.label}
            </dt>
            <dd className="text-[14px] font-semibold text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function OverviewTab({ summary, unit }: { summary: DoctorSummary; unit: GlucoseUnit }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <QualityCard quality={summary.quality} shared={analysisShared(summary)} />
      <StatsCard summary={summary} unit={unit} />
      <ThresholdsCard summary={summary} unit={unit} />
      <Card title={t.shared}>
        <ul className="flex flex-wrap gap-2">
          {orderedCategories(summary.session.categories).map((category) => (
            <li
              key={category}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-3 py-1 text-[13px] font-semibold text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-3.5 text-success"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              {fr.patients.categories[category]}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
