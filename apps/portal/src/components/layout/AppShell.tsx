// Cadre des pages d'un médecin connecté : en-tête (logo, navigation si le compte est approuvé, adresse
// connectée, menu « Apparence », « Se déconnecter »), puis la page. La déconnexion vide aussi le cache des requêtes.
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Logo';
import { Button } from '@/components/ui';
import { signOut, useSession } from '@/features/auth';
import { fill, fr } from '@/i18n/fr';
import { AppearanceMenu } from './AppearanceMenu';

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'transition-afy rounded-lg px-3 py-2 text-[14px] font-semibold',
          isActive
            ? 'bg-primary-soft text-primary-text'
            : 'text-muted hover:bg-surface-muted hover:text-ink',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const session = useSession();
  const [leaving, setLeaving] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;
  const approved = user?.status === 'APPROVED';

  return (
    <div className="min-h-dvh bg-page">
      <header className="sticky top-0 z-10 border-b border-line bg-[color-mix(in_srgb,var(--afy-background)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Wordmark size={30} />
          {approved ? (
            <nav aria-label="Navigation principale" className="hidden items-center gap-1 sm:flex">
              <NavItem to="/patients">{fr.shell.nav.patients}</NavItem>
              <NavItem to="/scan">{fr.shell.nav.scan}</NavItem>
            </nav>
          ) : null}
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {user ? (
              <span className="hidden max-w-[240px] truncate text-[13px] text-muted md:inline">
                {fill(fr.shell.signedInAs, { email: user.email })}
              </span>
            ) : null}
            <AppearanceMenu />
            <Button
              variant="outline"
              fullWidth={false}
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                await signOut();
              }}
            >
              {fr.shell.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="animate-fade mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
