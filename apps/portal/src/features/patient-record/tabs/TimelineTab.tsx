// Chronologie (L5-12) : mesures et évènements déclarés partagés, par jour, du plus récent au plus ancien.
// Le même composant sert aux onglets « Traitements », « Nutrition » et « Activité » (filtre `kind`) : une
// seule lecture du serveur pour les quatre onglets. Chaque ligne : heure, icône du type ET son nom, texte
// (valeur + moment pour une mesure, avec état en symbole + mot et provenance).
import type { GlucoseUnit, TimelineItem, TimelineKind } from '@glyka/shared';
import { useMemo, useState } from 'react';
import { Button, GlucoseStateBadge, ProvenanceBadge } from '@/components/ui';
import { fill, texts } from '@/i18n';
import { groupByDay, itemText, timeText } from '../view';

/** Lignes affichées d'abord, puis par paquets (« Afficher plus »). */
export const TIMELINE_STEP = 150;

const t = texts.record.timeline;

function KindIcon({ kind }: { kind: TimelineKind }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      {kind === 'MEASUREMENT' ? (
        // Goutte : glycémie.
        <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z" {...common} />
      ) : kind === 'MEAL' ? (
        // Couverts : repas.
        <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3" {...common} />
      ) : kind === 'ACTIVITY' ? (
        // Pas : activité.
        <>
          <circle cx="13" cy="4.5" r="1.8" {...common} />
          <path d="M9 21l2.5-6 2.5 2.5V21M8 12l3-4 3 2.5 3 1M11.5 8 10 13" {...common} />
        </>
      ) : kind === 'TREATMENT' ? (
        // Gélule : traitement déclaré.
        <>
          <rect
            x="3"
            y="8.5"
            width="18"
            height="7"
            rx="3.5"
            transform="rotate(-35 12 12)"
            {...common}
          />
          <path d="M9.5 8.5l5 7" {...common} />
        </>
      ) : (
        <path d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4M12 17h.01" {...common} />
      )}
    </svg>
  );
}

const KIND_TONE: Record<TimelineKind, string> = {
  MEASUREMENT: 'bg-surface-muted text-ink', // neutre : une teinte rouge près d'une glycémie passerait pour une alerte
  MEAL: 'bg-surface-muted text-ink',
  ACTIVITY: 'bg-surface-muted text-ink',
  TREATMENT: 'bg-surface-muted text-ink',
  ALERT: 'bg-surface-muted text-warning',
};

export function TimelineTab({
  items,
  truncated,
  unit,
  kind,
  now,
}: {
  items: TimelineItem[];
  truncated: boolean;
  unit: GlucoseUnit;
  /** Onglet d'un seul type d'évènement (traitements, repas, activité) ; absent : tout. */
  kind?: 'TREATMENT' | 'MEAL' | 'ACTIVITY';
  now: Date;
}) {
  const [shown, setShown] = useState(TIMELINE_STEP);
  const filtered = useMemo(
    () => (kind ? items.filter((item) => item.kind === kind) : items),
    [items, kind],
  );
  const days = useMemo(() => groupByDay(filtered.slice(0, shown), now), [filtered, shown, now]);

  return (
    <>
      {kind === 'TREATMENT' ? (
        <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-muted">
          {t.treatmentsHint}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-[14px] text-muted">
          {kind ? t.emptyKind[kind] : t.empty}
        </p>
      ) : (
        <ol className="flex flex-col gap-6" aria-label={t.listA11y}>
          {days.map((day) => (
            <li key={day.key} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold tracking-[0.2px] text-muted first-letter:uppercase">
                {day.label}
              </h3>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {day.items.map((item, index) => {
                  const text = itemText(item, unit);
                  return (
                    <li
                      key={`${item.at}-${index}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                      aria-label={fill(t.itemA11y, {
                        time: timeText(item.at),
                        kind: t.kind[item.kind],
                        text: [
                          text,
                          item.state ? texts.record.states[item.state] : null,
                          item.details ? fill(t.detailsA11y, { details: item.details }) : null,
                        ]
                          .filter(Boolean)
                          .join(', '),
                      })}
                    >
                      <span className="w-12 shrink-0 text-[13px] font-semibold text-muted tabular-nums">
                        {timeText(item.at)}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${KIND_TONE[item.kind]}`}
                      >
                        <KindIcon kind={item.kind} />
                        {t.kind[item.kind]}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] text-ink">{text}</span>
                        {/* Texte libre du patient : seulement s'il partage ses notes (contrat 0.4.2). */}
                        {item.details ? (
                          <span className="text-[13px] text-muted italic">« {item.details} »</span>
                        ) : null}
                      </span>
                      {item.state || item.source ? (
                        <span className="flex items-center gap-2">
                          {item.state ? <GlucoseStateBadge state={item.state} /> : null}
                          {item.source ? (
                            <ProvenanceBadge
                              source={item.source}
                              importBatchId={item.importBatchId}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {shown < filtered.length ? (
        <Button
          variant="outline"
          fullWidth={false}
          className="self-center"
          onClick={() => setShown((n) => n + TIMELINE_STEP)}
        >
          {t.showMore}
        </Button>
      ) : null}
      {truncated ? (
        <p className="text-[13px] text-muted">{fill(t.more, { count: items.length })}</p>
      ) : null}
    </>
  );
}
