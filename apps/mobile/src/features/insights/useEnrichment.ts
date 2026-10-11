// Phrases reprises du serveur pour l'analyse affichée (L3-09). L'analyse locale s'affiche d'abord ; les
// reformulations du serveur arrivent ensuite (en ligne seulement) et remplacent les phrases concernées.
// Un résultat ne s'applique qu'à l'analyse pour laquelle il a été calculé (changer de période ou relire la
// base n'affiche jamais les phrases d'une autre analyse).
import type { LastDaysAnalysis } from '@glyka/analytics';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NO_ENRICHMENT, type Enrichment } from './enrichment';
import { loadEnrichment } from './server-enrichment';

export function useEnrichment(analysis: LastDaysAnalysis | null, days: number): Enrichment {
  const { i18n } = useTranslation();
  const [result, setResult] = useState<{ for: LastDaysAnalysis | null; value: Enrichment }>({
    for: null,
    value: NO_ENRICHMENT,
  });

  useEffect(() => {
    if (!analysis) return;
    let current = true; // une réponse arrivée après un changement d'analyse est ignorée
    void loadEnrichment(analysis, days, i18n.language).then((value) => {
      if (current) setResult({ for: analysis, value });
    });
    return () => {
      current = false;
    };
  }, [analysis, days, i18n.language]);

  return result.for === analysis ? result.value : NO_ENRICHMENT;
}
