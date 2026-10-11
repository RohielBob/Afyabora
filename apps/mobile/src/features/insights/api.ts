// Appel GET /insights (contrat docs/api/openapi.v0.json, L3-03 ; champ `summary` depuis 0.3.0, L3-06).
import { api } from '@/lib/api-client';
import type { ServerInsights } from './enrichment';

export const insightsApi = {
  /** Analyse calculée par le serveur pour les `days` derniers jours (phrases éventuellement reformulées). */
  get: (days: number) => api<ServerInsights>(`/insights?period=${days}`),
};
