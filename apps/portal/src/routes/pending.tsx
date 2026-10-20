// « Compte en attente » (L1-11) : un médecin connecté mais pas encore APPROUVÉ (approbation : L1-12).
// Aucun dossier patient n'est accessible (gardes de routes + contrôle du serveur à chaque requête).
// La page explique pourquoi, où en est le compte (3 étapes), et comment l'activer une fois approuvé.
// Variante « compte non validé » pour un statut REJECTED.
//
// Pourquoi « se reconnecter » : le statut du compte est donné par le serveur à la connexion
// (POST /auth/login) ; il n'existe pas de route pour le relire (contrat inchangé).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui';
import { signOut, useSession } from '@/features/auth';
import { texts } from '@/i18n';

type StepState = 'done' | 'now' | 'next';

function StepBadge({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-success text-on-primary">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (state === 'now') {
    return (
      <span className="relative flex size-9 items-center justify-center">
        <span
          aria-hidden="true"
          className="animate-pulse-ring absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--afy-warning)_30%,transparent)]"
        />
        <span className="relative flex size-9 items-center justify-center rounded-full border-2 border-warning bg-surface text-warning">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4.2l2.8 1.8" />
          </svg>
        </span>
      </span>
    );
  }
  return (
    <span className="flex size-9 items-center justify-center rounded-full border-2 border-line-strong bg-surface" />
  );
}

export default function PendingRoute() {
  const session = useSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;
  const rejected = user?.status === 'REJECTED';
  const states: StepState[] = ['done', 'now', 'next'];
  const stepLabel: Record<StepState, string> = {
    done: texts.pending.stepDone,
    now: texts.pending.stepNow,
    next: texts.pending.stepNext,
  };

  const reconnect = async () => {
    setLeaving(true);
    const email = user?.email ?? '';
    await signOut();
    navigate(`/login?email=${encodeURIComponent(email)}`, { replace: true });
  };

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="animate-enter flex flex-col gap-3">
          <p
            className={`text-[11px] font-bold tracking-[1.2px] uppercase ${rejected ? 'text-danger' : 'text-warning'}`}
          >
            {rejected ? texts.pending.rejectedOverline : texts.pending.overline}
          </p>
          <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.6px] text-ink">
            {rejected ? texts.pending.rejectedTitle : texts.pending.title}
          </h1>
          <p className="text-[16px] text-muted">
            {rejected ? texts.pending.rejectedText : texts.pending.text}
          </p>
        </header>

        {rejected ? null : (
          <>
            {/* Où en est le compte : étapes reliées par un trait. */}
            <ol className="animate-enter flex flex-col rounded-2xl border border-line bg-surface p-6 [animation-delay:60ms]">
              {texts.pending.steps.map((step, i) => {
                const state = states[i] ?? 'next';
                return (
                  <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < texts.pending.steps.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute top-10 bottom-1 left-[17px] w-0.5 rounded-full ${state === 'done' ? 'bg-success' : 'bg-line'}`}
                      />
                    ) : null}
                    <StepBadge state={state} />
                    <div className="flex flex-col pt-1.5">
                      <span
                        className={`text-[15px] font-semibold ${state === 'next' ? 'text-muted' : 'text-ink'}`}
                      >
                        {step}
                      </span>
                      <span className="text-[13px] text-muted">{stepLabel[state]}</span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <section className="animate-enter flex flex-col gap-3 rounded-2xl bg-surface-muted p-6 [animation-delay:120ms]">
              <h2 className="text-[17px] font-semibold text-ink">{texts.pending.whileTitle}</h2>
              <ul className="flex flex-col gap-2 text-[15px] text-muted">
                {texts.pending.while.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-subtle"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            <div className="animate-enter [animation-delay:180ms]">
              <Button variant="outline" size="lg" loading={leaving} onClick={reconnect}>
                {texts.pending.recheck}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
