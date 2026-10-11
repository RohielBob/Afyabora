// Chargement de l'enrichissement par le serveur (L3-09) : la LOGIQUE, sans interface (testée dans
// __tests__/server-enrichment.test.ts). Ne fait JAMAIS attendre ni échouer l'écran : hors-ligne, serveur
// injoignable, session expirée, réponse inattendue… ⇒ aucune reprise, l'analyse locale reste affichée telle
// quelle.
import type { LastDaysAnalysis } from '@glyka/analytics';
import { isOnline } from '@/features/sync';
import { insightsApi } from './api';
import { NO_ENRICHMENT, enrich, type Enrichment, type ServerInsights } from './enrichment';

/** D'où viennent les données (remplaçable dans les tests). */
export interface EnrichmentSources {
  online: () => Promise<boolean>;
  fetch: (days: number) => Promise<ServerInsights>;
}

const deviceSources: EnrichmentSources = { online: isOnline, fetch: insightsApi.get };

export async function loadEnrichment(
  local: LastDaysAnalysis,
  days: number,
  language: string,
  sources: EnrichmentSources = deviceSources,
): Promise<Enrichment> {
  // En anglais, les phrases du serveur (françaises) ne servent pas : pas d'appel réseau inutile.
  if (!language.startsWith('fr')) return NO_ENRICHMENT;
  try {
    if (!(await sources.online())) return NO_ENRICHMENT;
    const server = await sources.fetch(days);
    if (!server || !Array.isArray(server.insights) || !server.period) return NO_ENRICHMENT;
    return enrich(local, server, language);
  } catch {
    return NO_ENRICHMENT;
  }
}
