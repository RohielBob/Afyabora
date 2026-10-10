// Gardes de routes (L1-11) : qui peut ouvrir quelle page.
//  - <GuestOnly>       : connexion, inscription, mot de passe oublié. Déjà connecté ⇒ sa page d'accueil.
//  - <RequireDoctor>   : médecin connecté (quel que soit le statut). Sinon ⇒ /login.
//  - <RequireApproved> : médecin APPROUVÉ. En attente ou refusé ⇒ /pending : aucun dossier accessible.
//  - <PendingOnly>     : la page « compte en attente » ; un compte approuvé est envoyé vers ses patients.
// Ces gardes guident l'interface ; la vraie protection est sur le serveur (rôle + statut à chaque requête).
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PageLoader } from '@/components/layout/PageLoader';
import { PATHS, destinationFor } from './rules';
import { useSession } from './session';

function homeOf(user: Parameters<typeof destinationFor>[0]): string {
  const destination = destinationFor(user);
  return destination === 'notDoctor' ? '/login' : PATHS[destination];
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === 'loading') return <PageLoader />;
  if (session.status === 'signedIn') return <Navigate to={homeOf(session.user)} replace />;
  return children;
}

export function RequireDoctor({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <PageLoader />;
  if (session.status !== 'signedIn') {
    // On retient la page demandée pour y revenir après la connexion.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RequireApproved({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === 'signedIn' && session.user.status !== 'APPROVED') {
    return <Navigate to={PATHS.pending} replace />;
  }
  return <RequireDoctor>{children}</RequireDoctor>;
}

export function PendingOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === 'signedIn' && session.user.status === 'APPROVED') {
    return <Navigate to={PATHS.patients} replace />;
  }
  return <RequireDoctor>{children}</RequireDoctor>;
}
