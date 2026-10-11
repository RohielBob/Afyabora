// Enrichissement de l'analyse locale par le serveur (L3-09, CDC F6 : « les observations et leurs gabarits
// fonctionnent hors-ligne ; seule la reformulation par un modèle de langage exige le réseau »).
//
// Le téléphone calcule TOUJOURS l'analyse lui-même (L8-11) : c'est elle qui est affichée, même hors-ligne.
// En ligne, il demande aussi GET /insights : si le serveur a déjà reformulé certaines phrases (modèle de
// langage local, L3-05/L3-06, sous garde-fous), le téléphone les reprend, mais SEULEMENT si elles décrivent
// EXACTEMENT la même chose que son propre calcul :
//  - même période ;
//  - pour une observation : même type et MÊMES FAITS (sinon le serveur parle d'autres mesures, par exemple
//    tant que la synchronisation n'a pas tout envoyé) ;
//  - pour le résumé : mêmes statistiques et même qualité ;
//  - et la phrase du serveur contient exactement les mêmes nombres que celle du téléphone (seconde vérification).
// Les phrases du serveur sont en français : en anglais, on garde les traductions du téléphone.
// Tout le reste (chiffres, preuves, ordre, gravité) vient TOUJOURS du calcul local.
import type { InsightWithText, LastDaysAnalysis } from '@glyka/analytics';

/** Réponse de GET /insights (schéma InsightsResponse du contrat ; `summary` depuis le contrat 0.3.0). */
export interface ServerInsights {
  period: { from: string; to: string };
  quality: LastDaysAnalysis['quality'];
  stats: LastDaysAnalysis['stats'];
  insights: InsightWithText[];
  summary?: string;
}

/** Phrases reprises du serveur : par position de l'observation dans l'analyse LOCALE, et le résumé. */
export interface Enrichment {
  /** Indice de l'observation locale → phrase reformulée par le serveur. */
  texts: ReadonlyMap<number, string>;
  /** Résumé reformulé par le serveur, ou null. */
  summary: string | null;
}

export const NO_ENRICHMENT: Enrichment = { texts: new Map(), summary: null };

/** Texte comparable d'une valeur, clés triées (l'ordre des clés d'un objet JSON n'a pas d'importance). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Nombres d'une phrase, triés (« 7,5 » = « 7.5 ») : même liste = mêmes chiffres. */
export function numbersKey(text: string): string {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => n.replace(',', '.'))
    .sort()
    .join('|');
}

/**
 * Phrases du serveur à reprendre pour l'analyse locale `local` (texte du moteur dans `local.insights[i].text`
 * et `local.summary`). `language` : langue de l'application (les phrases du serveur sont en français).
 */
export function enrich(
  local: LastDaysAnalysis,
  server: ServerInsights,
  language: string,
): Enrichment {
  if (!language.startsWith('fr')) return NO_ENRICHMENT;
  if (server.period.from !== local.period.from || server.period.to !== local.period.to) {
    return NO_ENRICHMENT;
  }

  const texts = new Map<number, string>();
  const used = new Set<number>();
  local.insights.forEach((insight, i) => {
    const key = `${insight.type}|${canonical(insight.facts)}`;
    const match = server.insights.findIndex(
      (s, j) => !used.has(j) && `${s.type}|${canonical(s.facts)}` === key,
    );
    if (match < 0) return;
    used.add(match);
    const text = (server.insights[match] as InsightWithText).text;
    // Reprise seulement si c'est une VRAIE reformulation, avec exactement les mêmes nombres.
    if (text !== insight.text && numbersKey(text) === numbersKey(insight.text)) {
      texts.set(i, text);
    }
  });

  const sameAnalysis =
    canonical(server.stats) === canonical(local.stats) &&
    canonical(server.quality) === canonical(local.quality);
  const summary =
    sameAnalysis &&
    server.summary !== undefined &&
    server.summary !== local.summary &&
    numbersKey(server.summary) === numbersKey(local.summary)
      ? server.summary
      : null;

  return { texts, summary };
}
