// Ticket L3-09 : enrichissement de l'analyse locale par les phrases reformulées du serveur.
// L'analyse locale est calculée par le vrai moteur ; la « réponse du serveur » est la même analyse (comme
// le serveur la calcule avec le même moteur), dont on change certaines phrases comme le ferait le modèle.
import { analyzeLastDays, type GlucosePoint, type LastDaysAnalysis } from '@glyka/analytics';
import { NO_ENRICHMENT, enrich, numbersKey, type ServerInsights } from '../enrichment';
import { loadEnrichment, type EnrichmentSources } from '../server-enrichment';

const NOW = new Date(2026, 9, 11, 23, 30).getTime();
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
const tz = (time: number) => -new Date(time).getTimezoneOffset();

/** Semaine du 5 au 11 octobre : valeurs basses répétées, série haute, soirs hauts, jours manquants. */
function points(): GlucosePoint[] {
  const week: [number, number[] | null][] = [
    [5, [95, 140, 175, 120]],
    [6, [70, 150, 180, 110]],
    [7, null],
    [8, [65, 190, 240, 200]],
    [9, [100, 160, 210, 130]],
    [10, null],
    [11, [50, 145, 170, 125]],
  ];
  return week.flatMap(([day, values]) =>
    values === null
      ? []
      : values.map((mgDl, i) => ({ id: `${day}-${i}`, at: at(day, [7, 13, 19, 23][i]!), mgDl })),
  );
}

const local: LastDaysAnalysis = analyzeLastDays(points(), 7, { now: NOW, timeZone: tz });

/** Réponse du serveur : la même analyse, avec des phrases changées par `rewrite` (indice → texte). */
function serverWith(
  rewrite: Record<number, string> = {},
  overrides: Partial<ServerInsights> = {},
): ServerInsights {
  const copy = JSON.parse(JSON.stringify(local)) as ServerInsights;
  copy.insights = copy.insights.map((insight, i) => ({
    ...insight,
    text: rewrite[i] ?? insight.text,
  }));
  return { ...copy, ...overrides };
}

/** Même instant un jour plus tôt (autre période que celle du téléphone). */
const shiftDay = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString();

const typeIndex = (type: string) => local.insights.findIndex((i) => i.type === type);
const HYPO = typeIndex('REPEATED_HYPO');
const STREAK = typeIndex('HIGH_STREAK');

describe('reprise des phrases du serveur', () => {
  it('le jeu contient bien plusieurs observations', () => {
    expect(local.insights.map((i) => i.type)).toEqual(
      expect.arrayContaining(['REPEATED_HYPO', 'HIGH_STREAK', 'MISSING_DATA']),
    );
  });

  it('phrase reformulée, mêmes faits, mêmes nombres : reprise', () => {
    const better = 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.';
    const result = enrich(local, serverWith({ [HYPO]: better }), 'fr');
    expect([...result.texts]).toEqual([[HYPO, better]]);
  });

  it('phrase identique au gabarit (pas encore reformulée) : rien à reprendre', () => {
    expect(enrich(local, serverWith(), 'fr').texts.size).toBe(0);
  });

  it('nombres différents : refusée (seconde vérification côté téléphone)', () => {
    const wrong = 'Vous avez eu 3 mesures sous le seuil bas au cours des 7 derniers jours.';
    expect(enrich(local, serverWith({ [HYPO]: wrong }), 'fr').texts.size).toBe(0);
  });

  it('le serveur décrit d’autres mesures (faits différents) : rien n’est repris pour cette observation', () => {
    const server = serverWith({
      [HYPO]: 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.',
      [STREAK]: 'Vous avez eu une série de 3 mesures consécutives au-dessus du seuil haut.',
    });
    server.insights[HYPO] = {
      ...server.insights[HYPO]!,
      facts: { ...server.insights[HYPO]!.facts, count: 3 },
    };
    const result = enrich(local, server, 'fr');
    expect(result.texts.has(HYPO)).toBe(false);
    expect(result.texts.has(STREAK)).toBe(true);
  });

  it('ordre des clés des faits sans importance ; ordre des observations sans importance', () => {
    const better = 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.';
    const server = serverWith({ [HYPO]: better });
    server.insights = server.insights
      .map((i) => ({ ...i, facts: Object.fromEntries(Object.entries(i.facts).reverse()) }))
      .reverse();
    expect(enrich(local, server, 'fr').texts.get(HYPO)).toBe(better);
  });

  it('autre période (autre jour, autre fuseau) : rien n’est repris', () => {
    const server = serverWith(
      { [HYPO]: 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.' },
      { period: { from: shiftDay(local.period.from), to: shiftDay(local.period.to) } },
    );
    expect(enrich(local, server, 'fr')).toEqual(NO_ENRICHMENT);
  });

  it('application en anglais : les phrases françaises du serveur ne sont pas reprises', () => {
    const server = serverWith({
      [HYPO]: 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.',
    });
    expect(enrich(local, server, 'en')).toEqual(NO_ENRICHMENT);
  });
});

describe('reprise du résumé', () => {
  const better = local.summary.replace('Sur les 7 derniers jours,', 'Ces 7 derniers jours,');

  it('mêmes statistiques, même qualité, mêmes nombres : repris', () => {
    expect(enrich(local, serverWith({}, { summary: better }), 'fr').summary).toBe(better);
  });

  it('statistiques différentes (le serveur n’a pas les mêmes mesures) : non repris', () => {
    const stats = { ...local.stats!, count: local.stats!.count + 1 };
    expect(enrich(local, serverWith({}, { summary: better, stats }), 'fr').summary).toBeNull();
  });

  it('nombre changé, résumé identique ou absent : non repris', () => {
    const changed = better.replace('70 %', '71 %');
    expect(enrich(local, serverWith({}, { summary: changed }), 'fr').summary).toBeNull();
    expect(enrich(local, serverWith({}, { summary: local.summary }), 'fr').summary).toBeNull();
    expect(enrich(local, serverWith({}, { summary: undefined }), 'fr').summary).toBeNull();
  });
});

describe('nombres d’une phrase', () => {
  it('triés, « 7,5 » = « 7.5 »', () => {
    expect(numbersKey('70 % contre 50 %, soit 7,5')).toBe(numbersKey('7.5 puis 50 % et 70 %'));
    expect(numbersKey('2 sur 7')).not.toBe(numbersKey('2 jours'));
  });
});

describe('chargement : jamais bloquant, jamais en erreur', () => {
  const better = 'Vous avez eu 2 mesures sous le seuil bas au cours des 7 derniers jours.';
  const sources = (overrides: Partial<EnrichmentSources> = {}) => {
    const calls: number[] = [];
    const s: EnrichmentSources = {
      online: async () => true,
      fetch: async (days) => {
        calls.push(days);
        return serverWith({ [HYPO]: better });
      },
      ...overrides,
    };
    return { s, calls };
  };

  it('en ligne : demande la même période au serveur et reprend les phrases', async () => {
    const { s, calls } = sources();
    const result = await loadEnrichment(local, 7, 'fr', s);
    expect(calls).toEqual([7]);
    expect(result.texts.get(HYPO)).toBe(better);
  });

  it('hors-ligne : aucun appel réseau', async () => {
    const { s, calls } = sources({ online: async () => false });
    expect(await loadEnrichment(local, 7, 'fr', s)).toEqual(NO_ENRICHMENT);
    expect(calls).toEqual([]);
  });

  it('en anglais : aucun appel réseau (phrases du serveur en français)', async () => {
    const { s, calls } = sources();
    expect(await loadEnrichment(local, 7, 'en', s)).toEqual(NO_ENRICHMENT);
    expect(calls).toEqual([]);
  });

  it.each([
    ['serveur injoignable', () => Promise.reject(new Error('réseau'))],
    ['session expirée', () => Promise.reject(Object.assign(new Error('401'), { status: 401 }))],
    ['réponse inattendue', () => Promise.resolve({} as ServerInsights)],
  ])('%s : analyse locale inchangée, sans erreur', async (_, fetch) => {
    const { s } = sources({ fetch });
    await expect(loadEnrichment(local, 7, 'fr', s)).resolves.toEqual(NO_ENRICHMENT);
  });

  it('détection du réseau en erreur : analyse locale inchangée', async () => {
    const { s, calls } = sources({ online: () => Promise.reject(new Error('NetInfo')) });
    await expect(loadEnrichment(local, 7, 'fr', s)).resolves.toEqual(NO_ENRICHMENT);
    expect(calls).toEqual([]);
  });
});
