// Démarrage du portail : langue et thème (choisis par le médecin dans le menu « Langue et apparence »),
// reprise de la session de l'onglet, puis affichage. À la fin d'une session (déconnexion, expiration,
// inactivité), le cache des requêtes est vidé : aucune donnée patient ne reste en mémoire (README du
// portail).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { getSession, initSession, subscribeSession } from './features/auth';
import { startLanguage, useLanguage } from './i18n';
import { router } from './router';
import { startTheme } from './theme/theme';
import './styles/index.css';

startLanguage();
startTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

subscribeSession(() => {
  if (getSession().status === 'signedOut') queryClient.clear();
});

void initSession();

/**
 * Au changement de langue, les pages sont redessinées (la clé change) : tous les textes et toutes les
 * dates passent dans la nouvelle langue. L'adresse, la session et le cache des données sont gardés
 * (ils vivent hors des pages) : le dossier ouvert réapparaît aussitôt, sans nouvelle requête.
 */
function App() {
  const language = useLanguage();
  return <RouterProvider key={language} router={router} />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
