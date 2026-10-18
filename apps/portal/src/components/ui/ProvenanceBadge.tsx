// Badge de provenance d'une mesure pour le portail du médecin (L4-09, CDC F4 : « badge de provenance sur
// chaque mesure ») : saisie, import avec son lot, ou appareil. Même règle que l'application du patient
// (provenanceOf, @glyka/shared) et mêmes mots : le médecin et le patient voient la même chose.
// Pastille neutre : icône + texte (jamais la couleur seule), lisible en clair comme en sombre.
// Utilisé par le dossier patient (L5-12) : chronologie et tableau des mesures.
import { provenanceOf, type MeasurementSource } from '@glyka/shared';
import { fill, fr } from '@/i18n/fr';

/** Texte du badge : « Saisie », « Import », « Import · lot 3F2A1C », « Appareil ». */
export function provenanceLabel(source: MeasurementSource, importBatchId?: string | null): string {
  const { batch } = provenanceOf(source, importBatchId);
  return batch ? fill(fr.provenance.importBatch, { batch }) : fr.provenance[source];
}

function Icon({ source }: { source: MeasurementSource }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0">
      {source === 'MANUAL' ? (
        // Crayon : saisie à la main.
        <>
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" {...common} />
          <path d="m13.5 6.5 4 4" {...common} />
        </>
      ) : source === 'IMPORT' ? (
        // Document : fichier importé.
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" {...common} />
          <path d="M14 3v5h5M9 13h6M9 17h6" {...common} />
        </>
      ) : (
        // Puce : appareil de mesure.
        <>
          <rect x="7" y="7" width="10" height="10" rx="2" {...common} />
          <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" {...common} />
        </>
      )}
    </svg>
  );
}

export function ProvenanceBadge({
  source,
  importBatchId,
}: {
  source: MeasurementSource;
  importBatchId?: string | null;
}) {
  const label = provenanceLabel(source, importBatchId);
  return (
    <span
      role="img"
      aria-label={fill(fr.provenance.a11y, { label })}
      title={label}
      className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted"
    >
      <Icon source={source} />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
