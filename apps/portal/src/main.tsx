// Démarrage du portail : thème (jetons @glyka/ui-tokens), reprise de la session de l'onglet, puis
// affichage. À la fin d'une session (déconnexion, expiration, inactivité), le cache des requêtes est
// vidé : aucune donnée patient ne reste en mémoire (README du portail).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { getSession, initSession, subscribeSession } from './features/auth';
import { router } from './router';
import { applyTheme } from './theme/theme';
import './styles/index.css';

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

subscribeSession(() => {
  if (getSession().status === 'signedOut') queryClient.clear();
});

void initSession();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
