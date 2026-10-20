// « Mes patients partagés » (L5-11, CDC F8) : les patients qui ont partagé leur dossier avec ce médecin
// (GET /doctor/sessions) : accès en cours d'abord, avec l'heure de fin, ce qui est partagé, la dernière
// mesure et la qualité des données ; puis les accès terminés (grisés, sans bouton).
//  - Rafraîchie toutes les 30 s et au retour sur l'onglet : un accès arrêté par le patient disparaît des
//    « en cours » sans recharger la page. (L'accès réel est revérifié par le serveur à chaque requête.)
//  - À la déconnexion, la liste est effacée de la mémoire (cache vidé, main.tsx).
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, ButtonLink, Spinner } from '@/components/ui';
import { SessionCard } from '@/features/sessions/SessionCard';
import { sessionsApi } from '@/features/sessions/api';
import { fill, texts } from '@/i18n';
import { ApiError } from '@/lib/api-client';

export const SESSIONS_REFRESH_MS = 30_000;

export default function PatientsRoute() {
  const query = useQuery({
    queryKey: ['doctor', 'sessions'],
    queryFn: sessionsApi.list,
    // Relue à CHAQUE ouverture de la page : sans cela, le cache global (30 s) cachait le patient qu'on
    // vient de scanner pendant 30 s (défaut vu en vérification réelle).
    staleTime: 0,
    refetchInterval: SESSIONS_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  const now = new Date();
  const items = query.data?.items ?? [];
  const activeCount = items.filter((s) => s.status === 'ACTIVE').length;
  const offline = query.error instanceof ApiError && query.error.status === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="animate-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
            {texts.patients.overline}
          </p>
          <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.6px] text-ink">
            {texts.patients.title}
          </h1>
          <p className="max-w-2xl text-[16px] text-muted">
            {query.data
              ? activeCount > 0
                ? fill(texts.patients.active, { count: activeCount })
                : texts.patients.activeNone
              : texts.patients.intro}
          </p>
        </div>
        <ButtonLink to="/scan" className="sm:w-auto sm:min-w-[220px]">
          {texts.patients.scan}
        </ButtonLink>
      </header>

      {query.isError ? (
        <Alert
          tone={offline ? 'warning' : 'danger'}
          title={
            offline ? texts.patients.problem.network.title : texts.patients.problem.server.title
          }
        >
          <span className="flex flex-col items-start gap-3">
            {offline ? texts.patients.problem.network.text : texts.patients.problem.server.text}
            <Button variant="outline" fullWidth={false} onClick={() => void query.refetch()}>
              {texts.patients.retry}
            </Button>
          </span>
        </Alert>
      ) : null}

      {query.isPending ? (
        <div className="flex items-center gap-3 text-[14px] text-muted" role="status">
          <Spinner size={20} />
          {texts.common.loading}
        </div>
      ) : null}

      {query.data && items.length === 0 ? (
        <section className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-10 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2" />
            <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" />
          </svg>
          <h2 className="text-[18px] font-bold text-ink">{texts.patients.empty.title}</h2>
          <p className="max-w-md text-[14px] text-muted">{texts.patients.empty.text}</p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label={texts.patients.listA11y}>
          {items.map((session, index) => (
            <SessionCard key={session.sessionId} session={session} now={now} index={index} />
          ))}
        </ul>
      ) : null}

      <p className="text-[13px] text-muted">{texts.patients.note}</p>
    </div>
  );
}
