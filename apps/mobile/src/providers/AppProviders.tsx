import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// TODO(L8-06/L8-07) : démarrer le moteur de synchronisation ici (déclencheurs réseau + ouverture de l'app).
// TODO(L1-07)       : fournisseur de session (jetons, verrouillage biométrique).
export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
