// Tests du ticket L3-05 : interface LlmProvider, fournisseur Ollama (modèle LOCAL), repli automatique sur
// les gabarits du moteur. Aucun vrai modèle ici : un faux serveur (fetch) et de faux fournisseurs.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightWithText } from '@glyka/analytics';
import { validateEnv } from '../src/config/env';
import { InsightsService } from '../src/modules/insights/insights.service';
import { createLlmProvider } from '../src/modules/insights/llm/create-provider';
import {
  CACHE_LIMIT,
  InsightWriter,
  RETRY_AFTER_MS,
} from '../src/modules/insights/llm/insight-writer.service';
import {
  LlmError,
  type LlmProvider,
  type LlmRequest,
} from '../src/modules/insights/llm/llm-provider';
import { OllamaProvider } from '../src/modules/insights/llm/ollama.provider';
import {
  MAX_LENGTH,
  MAX_SUMMARY_LENGTH,
  REPHRASE_SYSTEM,
  SUMMARY_SYSTEM,
  buildPrompt,
  buildSummaryPrompt,
  checkRewrite,
  negationsOf,
  numbersOf,
  parseSummary,
  parseTexts,
} from '../src/modules/insights/llm/rephrase';
import type { PrismaService } from '../src/prisma/prisma.service';

// Phrases du moteur (semaine de référence de L3-01).
const HYPO = "J'observe 2 mesures sous le seuil bas au cours des 7 derniers jours.";
const SLOT =
  'Les valeurs hautes sont plus fréquentes sur le créneau « soir » (40 % contre 20 % en général).';
const COMPARISON = 'Temps dans la cible : 70 % (période précédente : 50 %).';

const insight = (text: string, overrides: Partial<InsightWithText> = {}): InsightWithText => ({
  type: 'PERIOD_COMPARISON',
  severity: 'INFO',
  facts: {},
  evidenceIds: [],
  text,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
describe('consigne et lecture de la réponse', () => {
  it('la demande ne contient que les phrases du moteur, numérotées (aucun identifiant)', () => {
    expect(buildPrompt([HYPO, COMPARISON])).toBe(
      `Observations (2) :\n1. ${HYPO}\n2. ${COMPARISON}`,
    );
  });

  it('les consignes rappellent les règles absolues (chiffres, pas de diagnostic, JSON)', () => {
    expect(REPHRASE_SYSTEM).toMatch(/Recopie TOUS les nombres/);
    expect(REPHRASE_SYSTEM).toMatch(/Jamais de diagnostic/);
    expect(REPHRASE_SYSTEM).toMatch(/\{"textes": \["\.\.\."\]\}/);
  });

  it('réponse attendue : autant de phrases que demandé, espaces nettoyés', () => {
    expect(parseTexts('{"textes": ["  Une  phrase. ", "Deux."]}', 2)).toEqual([
      'Une phrase.',
      'Deux.',
    ]);
  });

  it.each([
    ['pas du JSON', 'Voici les phrases : …'],
    ['mauvaise clé', '{"texts": ["a", "b"]}'],
    ['trop peu de phrases', '{"textes": ["a"]}'],
    ['trop de phrases', '{"textes": ["a", "b", "c"]}'],
    ['autre chose que du texte', '{"textes": ["a", 2]}'],
    ['null', 'null'],
  ])('réponse refusée : %s', (_, raw) => {
    expect(parseTexts(raw, 2)).toBeNull();
  });
});

describe('garde-fous : une reformulation remplace le gabarit seulement si elle est sûre', () => {
  it('acceptée : mêmes nombres, ton descriptif (réponse réelle de llama3.1)', () => {
    const real =
      'Vos mesures étaient dans la cible 70 % du temps, contre 50 % sur la période précédente.';
    expect(checkRewrite(COMPARISON, real)).toBeNull();
    expect(
      checkRewrite(
        SLOT,
        'Les valeurs hautes sont plus fréquentes en soirée, avec 40 % contre 20 % en général.',
      ),
    ).toBeNull();
  });

  it('refusée : un nombre enlevé (réponse réelle : « ces derniers jours » sans le 7)', () => {
    expect(checkRewrite(HYPO, 'Vous avez eu 2 mesures sous le seuil bas ces derniers jours.')).toBe(
      'numbers',
    );
  });

  it('refusée : un nombre ajouté, changé ou calculé', () => {
    expect(
      checkRewrite(COMPARISON, 'Dans la cible 70 % du temps (50 % avant), soit +20 points.'),
    ).toBe('numbers');
    expect(checkRewrite(COMPARISON, 'Dans la cible 71 % du temps, contre 50 % avant.')).toBe(
      'numbers',
    );
  });

  it('un nombre répété ou en moins compte (« 7 jours sur 7 »)', () => {
    expect(checkRewrite('7 jour(s) sur 7 sans mesure.', 'Aucune mesure pendant 7 jours.')).toBe(
      'numbers',
    );
    expect(checkRewrite('2 mesures.', 'Deux fois 2, soit 2 mesures.')).toBe('numbers');
    expect(
      checkRewrite('7 jour(s) sur 7 sans mesure.', 'Les 7 jours sur 7 sont sans mesure.'),
    ).toBeNull();
  });

  it('« 7,5 » et « 7.5 » sont le même nombre', () => {
    expect(numbersOf('Moyenne 7,5 mmol/L et 7.5 aussi')).toEqual(['7.5', '7.5']);
    expect(checkRewrite('Valeur 7,5 mmol/L.', 'Vous aviez 7.5 mmol/L.')).toBeNull();
  });

  it.each([
    'Ce résultat évoque un diagnostic de diabète déséquilibré : 70 % et 50 %.',
    'Augmentez votre dose : 70 % et 50 %.',
    'Pensez à votre insuline : 70 % et 50 %.',
    'Votre traitement agit : 70 % et 50 %.',
    'Ce médicament aide : 70 % et 50 %.',
    'Vous devez marcher davantage : 70 % et 50 %.',
    'Il faut consulter vite : 70 % et 50 %.',
    'À cause des repas : 70 % et 50 %.',
    'Parce que vous mangez tard : 70 % et 50 %.',
    "C'est grave : 70 % et 50 %.",
    "Situation d'urgence : 70 % et 50 %.",
    'Vous êtes toujours dans la cible : 70 % et 50 %.',
    'Plus de détails sur https://exemple.org : 70 % et 50 %.',
  ])('refusée (mot interdit) : %s', (text) => {
    expect(checkRewrite(COMPARISON, text)).toBe('forbidden');
  });

  // Réponses RÉELLES du banc d'essai de L3-06 (20 phrases, llama3.1 et mistral-nemo).
  it('refusée : négation ajoutée qui inverse le sens (llama3.1 : « pas dans la cible 0 % »)', () => {
    const source = 'Temps dans la cible : 0 % (période précédente : 12 %).';
    const llama =
      "Vos mesures n'étaient pas dans la cible 0 % du temps, contre 12 % sur la période précédente.";
    expect(negationsOf(source)).toBe(0);
    expect(negationsOf(llama)).toBe(2);
    expect(checkRewrite(source, llama)).toBe('negation');
  });

  it('refusée : négation perdue qui change le sens (llama3.1 : « mesures incomplètes »)', () => {
    const source =
      '2 jour(s) sur 7 ne contiennent aucune mesure : certaines analyses peuvent être incomplètes.';
    expect(checkRewrite(source, 'Vos mesures étaient incomplètes 2 jour(s) sur 7.')).toBe(
      'negation',
    );
    // mistral-nemo garde le sens (« sans aucune mesure ») : acceptée.
    expect(
      checkRewrite(
        source,
        'Il y a eu 2 jour(s) sur 7 sans aucune mesure, certaines analyses peuvent être incomplètes.',
      ),
    ).toBeNull();
  });

  it('refusée : « vous avez observé » (c’est l’application qui observe, mistral-nemo)', () => {
    expect(
      checkRewrite(
        HYPO,
        'Vous avez observé 2 mesures sous le seuil bas au cours des 7 derniers jours.',
      ),
    ).toBe('forbidden');
  });

  it('les consignes rappellent les leçons du banc d’essai', () => {
    for (const system of [REPHRASE_SYSTEM, SUMMARY_SYSTEM]) {
      expect(system).toMatch(/aucune négation/);
      expect(system).toMatch(/n'écris jamais « vous avez observé »/);
    }
    expect(REPHRASE_SYSTEM).toMatch(/Garde les guillemets « »/);
  });

  it('refusée : vide ou trop longue', () => {
    expect(checkRewrite(COMPARISON, '')).toBe('empty');
    expect(checkRewrite(COMPARISON, `70 % et 50 %. ${'Très long. '.repeat(30)}`)).toBe('too-long');
    expect(MAX_LENGTH).toBe(280);
  });
});

describe('résumé (L3-06) : consigne, lecture de la réponse, garde-fous', () => {
  const SUMMARY =
    'Sur les 7 derniers jours, 20 mesures ont été analysées (qualité des données : bonne, 86/100). ' +
    'Elles étaient dans la cible 70 % du temps, au-dessus 20 % et en dessous 10 %. ' +
    'Points à examiner avec votre professionnel de santé : des valeurs basses répétées.';
  const GOOD =
    'Ces 7 derniers jours, 20 mesures ont été analysées, avec une bonne qualité des données (86/100). ' +
    'Vos valeurs étaient dans la cible 70 % du temps, au-dessus 20 % et en dessous 10 %. ' +
    'Un point est à examiner avec votre professionnel de santé : des valeurs basses répétées.';

  it('demande : seulement le résumé du moteur ; consigne en 5 règles, réponse {"texte": …}', () => {
    expect(buildSummaryPrompt(SUMMARY)).toBe(`Résumé à réécrire :\n${SUMMARY}`);
    expect(SUMMARY_SYSTEM).toMatch(/Recopie TOUS les nombres/);
    expect(SUMMARY_SYSTEM).toMatch(/garde ce rappel/);
    expect(SUMMARY_SYSTEM).toMatch(/\{"texte": "\.\.\."\}/);
  });

  it('lecture : texte nettoyé, ou null si ce n’est pas le JSON attendu', () => {
    expect(parseSummary('{"texte": "  Un   résumé. "}')).toBe('Un résumé.');
    expect(parseSummary('{"textes": ["a"]}')).toBeNull();
    expect(parseSummary('pas du json')).toBeNull();
    expect(parseSummary('{"texte": 3}')).toBeNull();
  });

  it('accepté : mêmes nombres, même sens, rappel gardé', () => {
    expect(checkRewrite(SUMMARY, GOOD, MAX_SUMMARY_LENGTH)).toBeNull();
  });

  it('refusé : rappel « professionnel de santé » perdu', () => {
    const lost = GOOD.replace('à examiner avec votre professionnel de santé', 'à noter');
    expect(checkRewrite(SUMMARY, lost, MAX_SUMMARY_LENGTH)).toBe('reminder');
  });

  it('refusé : nombre changé, négation ajoutée, trop long', () => {
    expect(checkRewrite(SUMMARY, GOOD.replace('86/100', '90/100'), MAX_SUMMARY_LENGTH)).toBe(
      'numbers',
    );
    expect(
      checkRewrite(SUMMARY, GOOD.replace('Un point est', "Aucun point n'est"), MAX_SUMMARY_LENGTH),
    ).toBe('negation');
    expect(checkRewrite(SUMMARY, `${GOOD} ${'Très long. '.repeat(90)}`, MAX_SUMMARY_LENGTH)).toBe(
      'too-long',
    );
    expect(MAX_SUMMARY_LENGTH).toBe(900);
  });
});

// ---------------------------------------------------------------------------------------------
describe('fournisseur Ollama (faux serveur)', () => {
  const options = { url: 'http://localhost:11434', model: 'llama3.1', timeoutMs: 5000 };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const request: LlmRequest = { system: 'consignes', prompt: 'phrases' };

  it('appelle POST /api/generate : modèle, consignes, JSON imposé, sans flux, peu créatif', async () => {
    const fetchFn = vi.fn(async () => reply({ response: '{"textes": []}' }));
    const provider = new OllamaProvider(options, fetchFn as unknown as typeof fetch);
    expect(await provider.generate(request)).toBe('{"textes": []}');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://localhost:11434/api/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'llama3.1',
      system: 'consignes',
      prompt: 'phrases',
      format: 'json',
      stream: false,
      options: { temperature: 0.2 },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('llama3.1');
  });

  it('serveur arrêté : LlmError « unreachable »', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = new OllamaProvider(options, fetchFn as unknown as typeof fetch);
    await expect(provider.generate(request)).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('trop lent : LlmError « timeout » (la requête est abandonnée)', async () => {
    const fetchFn = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const provider = new OllamaProvider(
      { ...options, timeoutMs: 20 },
      fetchFn as unknown as typeof fetch,
    );
    await expect(provider.generate(request)).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('erreur HTTP (modèle absent…) : LlmError « http »', async () => {
    const provider = new OllamaProvider(options, (async () =>
      reply({ error: 'model not found' }, 404)) as unknown as typeof fetch);
    await expect(provider.generate(request)).rejects.toMatchObject({ reason: 'http' });
  });

  it('réponse illisible ou sans « response » : LlmError « format »', async () => {
    const garbage = new OllamaProvider(
      options,
      (async () => new Response('pas du json', { status: 200 })) as unknown as typeof fetch,
    );
    await expect(garbage.generate(request)).rejects.toMatchObject({ reason: 'format' });
    const empty = new OllamaProvider(options, (async () =>
      reply({ done: true })) as unknown as typeof fetch);
    await expect(empty.generate(request)).rejects.toBeInstanceOf(LlmError);
  });
});

// ---------------------------------------------------------------------------------------------
/** Faux fournisseur : renvoie, pour chaque phrase demandée, la reformulation donnée (ou la phrase). */
function fakeLlm(
  rewrite: (sentence: string) => string = (s) => s,
  rewriteSummary: (summary: string) => string = (s) => s,
) {
  const calls: string[][] = [];
  const summaries: string[] = [];
  const llm: LlmProvider = {
    name: 'faux',
    model: 'modele-de-test',
    generate: async ({ system, prompt }) => {
      if (system === SUMMARY_SYSTEM) {
        const summary = prompt.replace(/^Résumé à réécrire :\n/, '');
        summaries.push(summary);
        return JSON.stringify({ texte: rewriteSummary(summary) });
      }
      const sentences = prompt
        .split('\n')
        .slice(1)
        .map((line) => line.replace(/^\d+\. /, ''));
      calls.push(sentences);
      return JSON.stringify({ textes: sentences.map(rewrite) });
    },
  };
  return { llm, calls, summaries };
}

const BETTER: Record<string, string> = {
  [COMPARISON]:
    'Vos mesures étaient dans la cible 70 % du temps, contre 50 % sur la période précédente.',
  [HYPO]: 'Vous avez eu 2 mesures sous le seuil bas ces derniers jours.', // le 7 manque : refusée
  [SLOT]: 'Les valeurs hautes sont plus fréquentes en soirée, avec 40 % contre 20 % en général.',
};

describe('InsightWriter : repli automatique sur les gabarits', () => {
  const insights = [insight(HYPO, { evidenceIds: ['a', 'b'] }), insight(SLOT), insight(COMPARISON)];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 11, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sans modèle (LLM_PROVIDER=none) : les gabarits, rien d’autre', async () => {
    const writer = new InsightWriter(null);
    expect(writer.write(insights).insights).toEqual(insights);
    await writer.idle();
    expect(writer.write(insights).insights).toEqual(insights);
  });

  it('ne fait JAMAIS attendre : gabarits d’abord, reformulations validées ensuite', async () => {
    const { llm, calls } = fakeLlm((s) => BETTER[s] ?? s);
    const writer = new InsightWriter(llm);

    const first = writer.write(insights).insights;
    expect(first.map((i) => i.text)).toEqual([HYPO, SLOT, COMPARISON]); // tout de suite
    await writer.idle();

    const second = writer.write(insights).insights;
    expect(second.map((i) => i.text)).toEqual([
      HYPO, // reformulation refusée (un nombre manquait) : le gabarit reste
      BETTER[SLOT],
      BETTER[COMPARISON],
    ]);
    // Seule la phrase change : type, gravité, faits et preuves sont ceux du moteur.
    expect(second.map(({ text: _t, ...rest }) => rest)).toEqual(
      insights.map(({ text: _t, ...rest }) => rest),
    );
    expect(calls).toEqual([[HYPO, SLOT, COMPARISON]]);
  });

  it('phrase déjà connue (acceptée ou refusée) : pas de nouvel appel au modèle', async () => {
    const { llm, calls } = fakeLlm((s) => BETTER[s] ?? s);
    const writer = new InsightWriter(llm);
    writer.write(insights);
    await writer.idle();
    writer.write(insights);
    writer.write([insight(COMPARISON)]);
    await writer.idle();
    expect(calls).toHaveLength(1);

    // Une nouvelle phrase seulement : seule elle est demandée.
    const other = 'Temps dans la cible : 64 % (période précédente : 70 %).';
    writer.write([insight(COMPARISON), insight(other)]);
    await writer.idle();
    expect(calls[1]).toEqual([other]);
  });

  it('une seule génération à la fois (le modèle local n’en fait qu’une efficacement)', async () => {
    const { llm, calls } = fakeLlm();
    const writer = new InsightWriter(llm);
    writer.write([insight(HYPO)]);
    writer.write([insight(SLOT)]); // pendant la première : pas de seconde génération
    await writer.idle();
    expect(calls).toEqual([[HYPO]]);
  });

  it.each([
    ['injoignable', new LlmError('unreachable')],
    ['trop lent', new LlmError('timeout')],
    ['erreur inattendue', new Error('panne')],
  ])('modèle %s : gabarits, puis pause d’une minute avant de réessayer', async (_, error) => {
    let calls = 0;
    const llm: LlmProvider = {
      name: 'faux',
      model: 'm',
      generate: async () => {
        calls += 1;
        throw error;
      },
    };
    const writer = new InsightWriter(llm);
    expect(writer.write(insights).insights).toEqual(insights);
    await writer.idle();
    expect(writer.write(insights).insights).toEqual(insights); // pendant la pause : aucun appel
    await writer.idle();
    expect(calls).toBe(1);

    vi.setSystemTime(Date.now() + RETRY_AFTER_MS);
    writer.write(insights);
    await writer.idle();
    expect(calls).toBe(2);
  });

  it('réponse au mauvais format : gabarits, et pause aussi', async () => {
    let calls = 0;
    const llm: LlmProvider = {
      name: 'faux',
      model: 'm',
      generate: async () => {
        calls += 1;
        return '{"textes": ["une seule phrase pour trois"]}';
      },
    };
    const writer = new InsightWriter(llm);
    writer.write(insights);
    await writer.idle();
    expect(writer.write(insights).insights).toEqual(insights);
    await writer.idle();
    expect(calls).toBe(1);
  });

  it('résumé : gabarit tout de suite, reformulation validée ensuite, dans la même tâche', async () => {
    const SUMMARY = 'Sur les 7 derniers jours, 20 mesures ont été analysées. Rien de particulier.';
    const BETTER_SUMMARY =
      'Ces 7 derniers jours, 20 mesures ont été analysées. Rien de particulier.';
    const { llm, calls, summaries } = fakeLlm(
      (s) => s,
      () => BETTER_SUMMARY,
    );
    const writer = new InsightWriter(llm);
    expect(writer.write(insights, SUMMARY).summary).toBe(SUMMARY);
    await writer.idle();
    expect(writer.write(insights, SUMMARY).summary).toBe(BETTER_SUMMARY);
    expect(calls).toHaveLength(1); // les phrases…
    expect(summaries).toEqual([SUMMARY]); // … puis le résumé, une seule fois
  });

  it('résumé refusé par les garde-fous : le gabarit reste, sans nouvel essai', async () => {
    const SUMMARY = 'Sur les 7 derniers jours, 20 mesures ont été analysées.';
    const { llm, summaries } = fakeLlm(
      (s) => s,
      () => 'Sur les 30 derniers jours, 20 mesures ont été analysées.', // nombre changé
    );
    const writer = new InsightWriter(llm);
    writer.write([], SUMMARY);
    await writer.idle();
    expect(writer.write([], SUMMARY).summary).toBe(SUMMARY);
    await writer.idle();
    expect(summaries).toHaveLength(1);
  });

  it('modèle en panne pendant les phrases : le résumé n’est même pas demandé', async () => {
    let calls = 0;
    const writer = new InsightWriter({
      name: 'faux',
      model: 'm',
      generate: async () => {
        calls += 1;
        throw new LlmError('timeout');
      },
    });
    expect(writer.write(insights, 'Résumé.').summary).toBe('Résumé.');
    await writer.idle();
    expect(calls).toBe(1);
  });

  it('sans résumé donné : aucune tâche de résumé', async () => {
    const { llm, summaries } = fakeLlm();
    const writer = new InsightWriter(llm);
    expect(writer.write(insights).summary).toBeUndefined();
    await writer.idle();
    expect(summaries).toEqual([]);
  });

  it(`mémoire limitée à ${CACHE_LIMIT} phrases : les plus anciennes sont oubliées`, async () => {
    const { llm, calls } = fakeLlm((s) => `${s} (reformulée)`);
    const writer = new InsightWriter(llm);
    const many = Array.from({ length: CACHE_LIMIT + 1 }, (_, i) => insight(`Phrase ${i}.`));
    writer.write(many);
    await writer.idle();
    expect(writer.write([many[CACHE_LIMIT]!]).insights[0]!.text).toBe(
      `Phrase ${CACHE_LIMIT}. (reformulée)`,
    );
    // La toute première a été oubliée : redemandée au modèle.
    expect(writer.write([many[0]!]).insights[0]!.text).toBe('Phrase 0.');
    await writer.idle();
    expect(calls.at(-1)).toEqual(['Phrase 0.']);
  });

  it('journaux : nombres de phrases et raisons, JAMAIS les phrases ni leurs chiffres', async () => {
    const messages: string[] = [];
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      messages.push(String(m));
    });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      messages.push(String(m));
    });
    try {
      const writer = new InsightWriter(fakeLlm((s) => BETTER[s] ?? s).llm);
      writer.write(insights);
      await writer.idle();
      const broken = new InsightWriter({
        name: 'faux',
        model: 'm',
        generate: async () => {
          throw new LlmError('unreachable');
        },
      });
      broken.write(insights);
      await broken.idle();
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
    const all = messages.join('\n');
    expect(all).toContain('2 acceptée(s), 1 refusée(s) [numbers]');
    expect(all).toContain('indisponible : unreachable');
    for (const secret of ['seuil bas', 'soir', 'cible', '40 %', '70 %', 'mesures']) {
      expect(all).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('GET /insights avec un modèle : la réponse n’attend pas, puis utilise la reformulation', () => {
  // 12 mesures de la semaine passée : 4 en dessous, 8 dans la plage (de quoi produire des observations).
  const now = Date.now();
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    measuredAt: new Date(now - (i + 1) * 12 * 3_600_000),
    valueMgDl: i < 4 ? 60 : 120,
  }));
  const prisma = {
    patientProfile: { findUnique: async () => null },
    measurement: { findMany: async () => rows },
  } as unknown as PrismaService;

  it('premier appel : gabarits ; appel suivant : reformulations validées, mêmes preuves', async () => {
    const { llm } = fakeLlm((s) => (s.startsWith("J'observe") ? `Vous noterez : ${s}` : s));
    const writer = new InsightWriter(llm);
    const service = new InsightsService(prisma, writer);

    const first = await service.insights('patient', 7);
    expect(first.insights.length).toBeGreaterThan(0);
    await writer.idle();
    const second = await service.insights('patient', 7);

    const hypo = (r: typeof first) => r.insights.find((i) => i.type === 'REPEATED_HYPO')!;
    expect(hypo(first).text).toMatch(/^J'observe/);
    expect(hypo(second).text).toBe(`Vous noterez : ${hypo(first).text}`);
    expect(hypo(second).evidenceIds).toEqual(hypo(first).evidenceIds);
    expect(second.stats).toEqual(first.stats);
    // Résumé : gabarit du moteur au premier appel, reformulation validée (identique ici) ensuite.
    expect(first.summary).toMatch(/^Sur les 7 derniers jours, 12 mesures ont été analysées/);
    expect(second.summary).toBe(first.summary);
  });

  it('modèle qui ne répond jamais : la réponse arrive quand même, avec les gabarits', async () => {
    const llm: LlmProvider = {
      name: 'faux',
      model: 'm',
      generate: () => new Promise<string>(() => undefined), // ne se termine jamais
    };
    const service = new InsightsService(prisma, new InsightWriter(llm));
    const result = await service.insights('patient', 7);
    expect(result.insights.find((i) => i.type === 'REPEATED_HYPO')!.text).toMatch(/^J'observe/);
  });
});

// ---------------------------------------------------------------------------------------------
describe('configuration', () => {
  const base = {
    DATABASE_URL: 'postgresql://utilisateur:motdepasse@localhost:5432/base',
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };

  it('par défaut : aucun modèle (ADR-0005), réglages Ollama prêts', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      LLM_PROVIDER: 'none',
      OLLAMA_URL: 'http://localhost:11434',
      LLM_MODEL: 'mistral-nemo', // choisi au banc d'essai de L3-06
      LLM_TIMEOUT_MS: 90_000,
    });
  });

  it('ollama accepté ; fournisseur inconnu, adresse invalide ou délai absurde refusés', () => {
    expect(validateEnv({ ...base, LLM_PROVIDER: 'ollama' }).LLM_PROVIDER).toBe('ollama');
    expect(() => validateEnv({ ...base, LLM_PROVIDER: 'anthropic' })).toThrow(/LLM_PROVIDER/);
    expect(() => validateEnv({ ...base, OLLAMA_URL: 'pas une adresse' })).toThrow(/OLLAMA_URL/);
    expect(() => validateEnv({ ...base, LLM_TIMEOUT_MS: '10' })).toThrow(/LLM_TIMEOUT_MS/);
  });

  const config = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('none ⇒ aucun fournisseur ; ollama ⇒ OllamaProvider avec le modèle choisi', () => {
    expect(createLlmProvider(config({ LLM_PROVIDER: 'none' }))).toBeNull();
    expect(createLlmProvider(config({}))).toBeNull();
    expect(createLlmProvider(config({ LLM_PROVIDER: 'inconnu' }))).toBeNull(); // jamais par défaut
    const provider = createLlmProvider(
      config({ LLM_PROVIDER: 'ollama', LLM_MODEL: 'mistral', OLLAMA_URL: 'http://ia.local:11434' }),
    );
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider!.model).toBe('mistral');
  });
});
