// Écran « Accès expiré » (L5-13, CDC F8) : affiché dès que l'accès à un dossier se termine (fin de la durée,
// arrêt par le patient, compte plus approuvé, dossier d'un autre médecin). Le motif est dans l'adresse
// (`?motif=expire|arrete|compte|inaccessible`) : jamais de donnée du patient, pas même son prénom.
//  - À l'ouverture, TOUS les dossiers encore en mémoire sont effacés (cache des requêtes `record`) : un
//    retour en arrière ou un rechargement ne ramène aucune donnée (le serveur refuse de toute façon).
//  - Deux suites : « Mes patients » et « Scanner un nouveau QR ».
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui';
import type { EndReason } from '@/features/patient-record/view';
import { texts } from '@/i18n';

/** Motif dans l'adresse ⇔ raison de fin. */
export const MOTIF: Record<EndReason, string> = {
  EXPIRED: 'expire',
  REVOKED: 'arrete',
  APPROVAL: 'compte',
  OTHER: 'inaccessible',
};

/** Raison lue dans l'adresse ; inconnue ou absente : « accès expiré ». */
export function reasonFromMotif(motif: string | null): EndReason {
  return (
    (Object.entries(MOTIF).find(([, value]) => value === motif)?.[0] as EndReason | undefined) ??
    'EXPIRED'
  );
}

export default function ExpiredRoute() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const reason = reasonFromMotif(params.get('motif'));
  const text = texts.expired.reason[reason];

  useEffect(() => {
    queryClient.removeQueries({ queryKey: ['record'] });
  }, [queryClient]);

  return (
    <section className="animate-enter mx-auto mt-6 flex max-w-xl flex-col items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-10 text-center sm:px-10">
      <span className="relative flex size-14 items-center justify-center rounded-full bg-surface-muted text-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
        </svg>
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
          {texts.expired.overline}
        </p>
        <h1 className="text-[24px] leading-tight font-bold text-ink">{text.title}</h1>
      </div>
      <p className="text-[15px] text-muted">{text.text}</p>
      <p className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 text-[13px] text-muted">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 text-success"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {texts.expired.erased}
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink to="/patients" className="sm:w-auto sm:min-w-[200px]">
          {texts.expired.patients}
        </ButtonLink>
        <ButtonLink to="/scan" variant="outline" className="sm:w-auto sm:min-w-[200px]">
          {texts.expired.scan}
        </ButtonLink>
      </div>
    </section>
  );
}
