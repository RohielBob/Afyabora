// Page publique de la carte d'urgence (L6-05, CDC F10) : `/e/<jeton>`, ouverte en scannant le QR d'urgence
// du patient avec N'IMPORTE quel téléphone, sans compte.
//  1. Confirmation : « Je suis un professionnel de santé ou un secouriste ». Rien n'est demandé au serveur
//     avant ce clic : l'ouverture (journalisée, patient averti) correspond à une vraie lecture.
//  2. La carte : uniquement ce que le patient a choisi d'y mettre, en grand, lisible d'un coup d'œil ;
//     « Appeler » le contact d'urgence ; date de mise à jour ; rappel « pas un dispositif médical ».
//  - Le jeton est retiré de l'adresse dès l'ouverture (pas dans l'historique du téléphone) ; la page n'est
//    jamais indexée par les moteurs de recherche (balise robots, en plus de l'en-tête de l'API).
//  - États : jamais par la couleur seule ; aucun état glycémique affiché (la page ne juge pas la valeur).
import type { EmergencyCardField, EmergencyCardPublic } from '@glyka/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Logo';
import { Alert, Button, Spinner } from '@/components/ui';
import {
  cardLines,
  cardProblem,
  fetchEmergencyCard,
  isEmergencyToken,
  telHref,
  updatedText,
  type CardProblem,
} from '@/features/emergency-card/card';
import { fill, texts } from '@/i18n';

const t = texts.emergency;

type State =
  | { kind: 'confirm' }
  | { kind: 'loading' }
  | { kind: 'card'; card: EmergencyCardPublic }
  | { kind: 'problem'; problem: CardProblem };

/** Pictogramme de chaque ligne (le texte dit toujours de quoi il s'agit). */
const ICONS: Partial<Record<EmergencyCardField, ReactNode>> = {
  diabetesType: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  declaredTreatment: (
    <>
      <rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-45 12 12)" />
      <path d="m9.2 9.2 5.6 5.6" />
    </>
  ),
  allergies: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  bloodGroup: <path d="M12 3c3.5 4.5 6.5 8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11 8.5 7.5 12 3Z" />,
  lastKnownGlucoseMgDl: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  emergencyContactName: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  emergencyContactPhone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
  ),
};

function Icon({ children, className = 'size-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Balise « robots: noindex » tant que la page est ouverte. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-3">
      <Wordmark size={30} showSpace={false} />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-bold tracking-[0.6px] text-primary-text uppercase">
        <Icon className="size-3.5">
          <path d="M12 5v14M5 12h14" />
        </Icon>
        {t.overline}
      </span>
    </header>
  );
}

function Confirm({ onConfirm }: { onConfirm: () => void }) {
  return (
    <section className="animate-enter flex flex-col gap-6 rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-[26px] leading-[1.2] font-extrabold tracking-[-0.5px] text-ink">
          {t.confirmTitle}
        </h1>
        <p className="text-[16px] text-muted">{t.confirmText}</p>
        <p className="text-[15px] font-semibold text-ink">{t.confirmWho}</p>
      </div>
      <Button size="lg" onClick={onConfirm}>
        {t.confirm}
      </Button>
      <ul className="flex flex-col gap-2 text-[14px] text-muted">
        <li className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-primary-text">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </Icon>
          {t.logged}
        </li>
        <li className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-warning">
            <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
            <path d="M12 10v4M12 17h.01" />
          </Icon>
          {t.lifeThreat}
        </li>
      </ul>
    </section>
  );
}

/** La carte affichée (exportée pour les tests). */
export function Card({ card }: { card: EmergencyCardPublic }) {
  const lines = cardLines(card);
  const updated = updatedText(card.updatedAt);
  return (
    <article className="animate-enter flex flex-col gap-5">
      <section className="flex flex-col gap-1 rounded-3xl border border-line bg-surface p-6">
        <p className="text-[12px] font-bold tracking-[1.2px] text-primary-text uppercase">
          {t.overline}
        </p>
        <h1 className="text-[30px] leading-[1.15] font-extrabold tracking-[-0.6px] text-ink">
          {card.fullName ?? t.noName}
        </h1>
      </section>

      {lines.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line-strong bg-surface p-6 text-center text-[15px] text-muted">
          {t.empty}
        </p>
      ) : (
        <dl className="flex flex-col divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {lines.map(({ field, text }) => (
            <div key={field} className="flex items-start gap-4 px-5 py-4">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-primary-text">
                <Icon>{ICONS[field]}</Icon>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <dt className="text-[13px] font-semibold text-muted">{t.fields[field]}</dt>
                <dd className="text-[19px] leading-[1.3] font-bold break-words text-ink">{text}</dd>
                {field === 'lastKnownGlucoseMgDl' ? (
                  <dd className="text-[13px] text-muted">{t.glucoseHint}</dd>
                ) : null}
                {field === 'emergencyContactPhone' ? (
                  <dd className="pt-2">
                    <a
                      href={telHref(text)}
                      aria-label={fill(t.callA11y, { phone: text })}
                      className="transition-afy inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-[16px] font-semibold text-on-primary hover:bg-primary-pressed"
                    >
                      <Icon>{ICONS.emergencyContactPhone}</Icon>
                      {t.call}
                    </a>
                  </dd>
                ) : null}
              </div>
            </div>
          ))}
        </dl>
      )}

      <footer className="flex flex-col gap-2 text-[13px] text-muted">
        <p>{fill(t.updated, updated)}</p>
        <p>{t.disclaimer}</p>
      </footer>
    </article>
  );
}

export default function EmergencyRoute() {
  const params = useParams();
  const navigate = useNavigate();
  // Lu une seule fois : l'adresse est ensuite remplacée par « /e » (le jeton ne reste pas dans l'historique).
  const [token] = useState(() => (isEmergencyToken(params.token) ? params.token : null));
  const [state, setState] = useState<State>({ kind: 'confirm' });
  useNoIndex();

  useEffect(() => {
    if (params.token) navigate('/e', { replace: true });
  }, [params.token, navigate]);

  const open = async () => {
    if (!token) return;
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'card', card: await fetchEmergencyCard(token) });
    } catch (error) {
      setState({ kind: 'problem', problem: cardProblem(error) });
    }
  };

  return (
    <div className="min-h-dvh bg-page">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:py-10">
        <Header />
        {!token ? (
          <Alert tone="warning" title={t.invalidLink.title}>
            {t.invalidLink.text}
          </Alert>
        ) : state.kind === 'confirm' ? (
          <Confirm onConfirm={() => void open()} />
        ) : state.kind === 'loading' ? (
          <p className="flex items-center gap-3 text-[15px] text-muted" aria-live="polite">
            <span className="text-primary-text">
              <Spinner size={22} />
            </span>
            {t.loading}
          </p>
        ) : state.kind === 'card' ? (
          <Card card={state.card} />
        ) : (
          <Alert
            tone={state.problem === 'unavailable' ? 'info' : 'warning'}
            title={t.problem[state.problem].title}
          >
            <span className="flex flex-col items-start gap-3">
              {t.problem[state.problem].text}
              {state.problem === 'unavailable' ? null : (
                <Button variant="outline" fullWidth={false} onClick={() => void open()}>
                  {t.retry}
                </Button>
              )}
            </span>
          </Alert>
        )}
      </main>
    </div>
  );
}
