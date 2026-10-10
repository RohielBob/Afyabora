import { Redirect } from 'expo-router';
import { useSession } from '@/features/auth';

// Point d'entrée : choisit le premier écran selon la session (L1-07).
//   pas de session            → accueil (/welcome), ou connexion si la session vient d'expirer
//   session, profil incomplet → assistant de profil
//   session, profil complet   → onglets (accueil de l'app)
// TODO(L1-09) : verrouillage biométrique avant d'entrer dans l'app.
export default function Index() {
  const session = useSession();
  if (session.status === 'loading') return null; // l'écran de lancement est encore affiché
  if (session.status === 'signedOut') {
    // Session expirée : directement l'écran de connexion (qui l'explique) ; sinon, l'accueil.
    return <Redirect href={session.reason === 'expired' ? '/(auth)/sign-in' : '/(auth)/welcome'} />;
  }
  return (
    <Redirect href={session.user.profileCompleted ? '/(tabs)' : '/(onboarding)/profile-setup'} />
  );
}
