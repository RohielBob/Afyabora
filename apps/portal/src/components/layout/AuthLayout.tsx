// Mise en page des écrans sans compte (connexion, inscription, liens reçus par email) :
//  - sur ordinateur : à gauche, un panneau de marque (ce que le portail permet, et ses garanties) ;
//    à droite, le formulaire ;
//  - sur tablette / téléphone : le formulaire seul, logo au-dessus.
// Menu « Apparence » en haut à droite, sur tous les écrans.
// Le contenu entre en douceur (fondu + léger glissement), désactivé si l'ordinateur réduit les animations.
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/Logo';
import { texts } from '@/i18n';
import { AppearanceMenu } from './AppearanceMenu';

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-primary-text">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
      <path
        d="M6 10.3l2.6 2.6L14 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthLayout({
  overline,
  title,
  subtitle,
  children,
  wide = false,
}: {
  overline?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Formulaire plus large (inscription en deux colonnes). */
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(380px,0.9fr)_1.1fr]">
      {/* Panneau de marque (ordinateur seulement) */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface-muted lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-primary-soft opacity-80 blur-3xl dark:opacity-45"
        />
        <div className="relative">
          <Wordmark />
        </div>
        <div className="animate-enter relative flex max-w-[440px] flex-col gap-8">
          <h2 className="text-[30px] leading-[1.2] font-extrabold tracking-[-0.6px] text-ink">
            {texts.brand.title}
          </h2>
          <ul className="flex flex-col gap-4">
            {texts.brand.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px] text-muted">
                <Check />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative max-w-[440px] text-[12px] leading-[1.5] text-subtle">
          {texts.brand.disclaimer}
        </p>
      </aside>

      {/* Formulaire */}
      <main className="relative flex min-h-dvh flex-col px-4 py-8 sm:px-8 lg:min-h-0 lg:justify-center lg:py-12">
        <div className="mb-10 flex items-center justify-between gap-4 lg:absolute lg:top-6 lg:right-8 lg:mb-0">
          <div className="lg:hidden">
            <Wordmark size={30} />
          </div>
          <AppearanceMenu />
        </div>
        <div
          className={`animate-enter mx-auto flex w-full flex-col gap-7 ${wide ? 'max-w-[600px]' : 'max-w-[420px]'}`}
        >
          {title ? (
            <header className="flex flex-col gap-2">
              {overline ? (
                <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
                  {overline}
                </p>
              ) : null}
              <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.5px] text-ink">
                {title}
              </h1>
              {subtitle ? <p className="text-[15px] text-muted">{subtitle}</p> : null}
            </header>
          ) : null}
          {children}
        </div>
        <p className="mx-auto mt-10 max-w-[420px] text-center text-[12px] text-subtle lg:hidden">
          {texts.brand.disclaimer}
        </p>
      </main>
    </div>
  );
}
