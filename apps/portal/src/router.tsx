// Routes du portail et qui peut les ouvrir (L1-11) :
//  - sans compte      : connexion, inscription, mot de passe oublié (déjà connecté ⇒ sa page d'accueil) ;
//  - liens des emails : vérification d'adresse et nouveau mot de passe, ouverts à tous (patients compris) ;
//  - médecin connecté : « compte en attente » ;
//  - médecin APPROUVÉ : patients, scan, dossier (pages des lots L5/L6, encore provisoires).
// La vraie protection reste le serveur : rôle et statut vérifiés à chaque requête.
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader } from '@/components/layout/PageLoader';
import {
  GuestOnly,
  PATHS,
  PendingOnly,
  RequireApproved,
  destinationFor,
  useSession,
} from '@/features/auth';
import ExpiredRoute from './routes/expired';
import ForgotPasswordRoute from './routes/forgot-password';
import LoginRoute from './routes/login';
import NotFoundRoute from './routes/not-found';
import PatientRecordRoute from './routes/patient-record';
import PatientsRoute from './routes/patients';
import PendingRoute from './routes/pending';
import RegisterRoute from './routes/register';
import ResetPasswordRoute from './routes/reset-password';
import ScanRoute from './routes/scan';
import VerifyEmailRoute from './routes/verify-email';

/** « / » : la bonne page selon la session (connexion, en attente, ou patients). */
function Home() {
  const session = useSession();
  if (session.status === 'loading') return <PageLoader />;
  if (session.status !== 'signedIn') return <Navigate to="/login" replace />;
  const destination = destinationFor(session.user);
  return <Navigate to={destination === 'notDoctor' ? '/login' : PATHS[destination]} replace />;
}

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },

  // Sans compte
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginRoute />
      </GuestOnly>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestOnly>
        <RegisterRoute />
      </GuestOnly>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <GuestOnly>
        <ForgotPasswordRoute />
      </GuestOnly>
    ),
  },

  // Liens reçus par email (patients et médecins)
  { path: '/verify-email', element: <VerifyEmailRoute /> },
  { path: '/reset-password', element: <ResetPasswordRoute /> },

  // Médecin connecté, compte pas encore approuvé
  {
    path: '/pending',
    element: (
      <PendingOnly>
        <PendingRoute />
      </PendingOnly>
    ),
  },

  // Médecin approuvé : en-tête commun + pages des lots suivants
  {
    element: (
      <RequireApproved>
        <AppShell />
      </RequireApproved>
    ),
    children: [
      { path: '/scan', element: <ScanRoute /> },
      { path: '/patients', element: <PatientsRoute /> },
      { path: '/patients/:sessionId', element: <PatientRecordRoute /> },
      { path: '/expired', element: <ExpiredRoute /> },
    ],
  },

  { path: '*', element: <NotFoundRoute /> },
]);
