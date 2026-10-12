// Tests du ticket L9-07 : mise en mots des réponses de l'assistant par le modèle de langage LOCAL.
//  - consigne, demande et VÉRIFICATION de la réponse du modèle (fonctions pures) ;
//  - file `AnswerWriter` : une réponse à la fois, délai de 2 minutes, pause après panne, file pleine,
//    démarrage, journal d'audit. Aucun vrai modèle ici : de faux fournisseurs et une fausse base.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeLastDays, type GlucosePoint } from '@glyka/analytics';
import { decryptField } from '../src/common/crypto/field-encryption';
import {
  ANSWER_SYSTEM,
  LENGTH_FACTOR,
  MAX_ANSWER_LENGTH,
  MAX_NEW_WORDS_RATIO,
  MIN_LENGTH_RATIO,
  buildAnswerPrompt,
  checkAnswerRewrite,
  composeAnswer,
  looksFrench,
  negationCount,
  newWordsRatio,
  numbersIn,
  parseAnswer,
  tidyAnswer,
  type AnswerRewrite,
} from '../src/modules/assistant/answers/answer-rewrite';
import {
  ANSWER_DEADLINE_MS,
  AnswerWriter,
  MAX_QUEUE,
  OVERDUE_GRACE_MS,
  type RewriteJob,
} from '../src/modules/assistant/answers/answer-writer.service';
import {
  MEASUREMENT_REMINDER,
  measurementAnswer,
  measurementRewrite,
} from '../src/modules/assistant/answers/measurement-answer';
import {
  SHEET_REMINDER,
  bestSheet,
  sheetAnswer,
} from '../src/modules/assistant/answers/sheet-answer';
import { loadSheets } from '../src/modules/assistant/knowledge/knowledge-sheets';
import { RETRY_AFTER_MS } from '../src/modules/insights/llm/insight-writer.service';
import type { AuditEntry, LlmAuditService } from '../src/modules/insights/llm/llm-audit.service';
import {
  LlmError,
  type LlmProvider,
  type LlmRequest,
} from '../src/modules/insights/llm/llm-provider';
import { OllamaProvider } from '../src/modules/insights/llm/ollama.provider';
import type { PrismaService } from '../src/prisma/prisma.service';

// Corps d'une réponse sur une fiche (extrait réel de la fiche hypoglycémie, raccourci).
const BODY =
  'Une glycémie trop basse, sous 70 mg/dL, qui peut donner un malaise.\n\nSi vous avez des signes, mesurez votre glycémie. Ne conduisez pas tant que vous ne vous sentez pas bien.';
const GOOD =
  'On parle de glycémie trop basse sous 70 mg/dL : elle peut donner un malaise.\n\nSi des signes apparaissent, mesurez votre glycémie. Ne conduisez pas tant que vous ne vous sentez pas bien.';

// ---------------------------------------------------------------- Consigne et demande
describe('consigne envoyée au modèle', () => {
  it('rappelle les règles absolues : nombres, rien ajouté, négations, pas de source, JSON', () => {
    expect(ANSWER_SYSTEM).toMatch(/TOUS les nombres/);
    expect(ANSWER_SYSTEM).toMatch(/N'ajoute AUCUNE information/);
    expect(ANSWER_SYSTEM).toMatch(/négation/);
    expect(ANSWER_SYSTEM).toMatch(/Ne parle ni de fiche, ni de source/);
    expect(ANSWER_SYSTEM).toMatch(/pas de dose, pas de médicament/);
    expect(ANSWER_SYSTEM).toMatch(/\{"texte": "\.\.\."\}/);
  });

  it('la demande ne contient que le corps du gabarit', () => {
    expect(buildAnswerPrompt(BODY)).toBe(`Texte à réécrire :\n${BODY}`);
  });

  it('la réponse complète remet la citation et le rappel du code autour du texte', () => {
    const rewrite: AnswerRewrite = {
      prefix: 'D’après la fiche « X » : ',
      body: BODY,
      suffix: '\n\nRappel.',
    };
    expect(composeAnswer(rewrite, 'Texte.')).toBe('D’après la fiche « X » : Texte.\n\nRappel.');
  });

  it('lecture de la réponse : JSON attendu, paragraphes gardés ; sinon null', () => {
    expect(parseAnswer(JSON.stringify({ texte: ' Un  texte.\n\n\nSuite. ' }))).toBe(
      'Un texte.\n\nSuite.',
    );
    expect(parseAnswer('pas du json')).toBeNull();
    expect(parseAnswer('null')).toBeNull();
    expect(parseAnswer(JSON.stringify({ textes: ['a'] }))).toBeNull();
    expect(parseAnswer(JSON.stringify({ texte: 42 }))).toBeNull();
  });

  it('remise en forme : espaces simples, une seule ligne vide entre paragraphes', () => {
    expect(tidyAnswer('  Un  texte\t ici. \r\n\n\n\n Deuxième   paragraphe.  ')).toBe(
      'Un texte ici.\n\nDeuxième paragraphe.',
    );
  });
});

// ---------------------------------------------------------------- Découpage des gabarits
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 12, 21, 0);
function eveningHighs(): GlucosePoint[] {
  const points: GlucosePoint[] = [];
  for (let d = 1; d <= 20; d++) {
    const day = NOW - d * 24 * HOUR;
    points.push({ id: randomUUID(), at: day - 12 * HOUR, mgDl: 110 });
    points.push({ id: randomUUID(), at: day - 1 * HOUR, mgDl: 230 });
  }
  return points;
}

describe('découpage des réponses gabarits', () => {
  it('mesures : le corps est fait des phrases du moteur, le rappel reste au code', () => {
    const analysis = analyzeLastDays(eveningHighs(), 30, { now: NOW, timeZone: 60 });
    const rewrite = measurementRewrite(analysis, ['TIME_OF_DAY_PATTERN']);
    expect(rewrite.prefix).toBe('');
    expect(rewrite.suffix).toBe(` ${MEASUREMENT_REMINDER}`);
    expect(rewrite.body).not.toContain(MEASUREMENT_REMINDER);
    expect(rewrite.body.startsWith(analysis.summary)).toBe(true);
    expect(composeAnswer(rewrite, rewrite.body)).toBe(
      measurementAnswer(analysis, ['TIME_OF_DAY_PATTERN']),
    );
  });

  it('fiche : la citation, le résumé de la fiche et le rappel restent au code ; le modèle n’a que l’extrait', () => {
    const sheets = loadSheets();
    const parsed = bestSheet(sheets, 'Que faire en cas d’hypoglycémie ?')!;
    const { text, rewrite } = sheetAnswer(parsed, 'Que faire en cas d’hypoglycémie ?');
    expect(rewrite.prefix).toBe(
      `D'après la fiche « ${parsed.sheet.title} » : ${parsed.sheet.summary}\n\n`,
    );
    expect(rewrite.suffix).toBe(`\n\n${SHEET_REMINDER}`);
    expect(rewrite.body).not.toContain(parsed.sheet.summary);
    expect(rewrite.body).not.toContain(SHEET_REMINDER);
    expect(rewrite.body).toMatch(/15 g de sucre rapide/);
    expect(composeAnswer(rewrite, rewrite.body)).toBe(text);
  });
});

// ---------------------------------------------------------------- Nombres et négations
describe('nombres et négations comptés comme un lecteur', () => {
  it('nombres : décimales à la française, mais pas le chiffre d’un nom (« HbA1c »)', () => {
    expect(numbersIn('Sous 70 mg/dL (0,70 g/L), 15 g, 88/100, 7.5 %')).toEqual([
      '70',
      '0.70',
      '15',
      '88',
      '100',
      '7.5',
    ]);
    expect(numbersIn('L’HbA1c se mesure tous les 3 mois.')).toEqual(['3']);
    expect(numbersIn('15g de sucre')).toEqual(['15']);
  });

  it('« ne … pas » compte pour UNE négation, comme « aucun », « sans » ou « non »', () => {
    expect(negationCount('Souvent aucun signe au début.')).toBe(1);
    expect(negationCount("Il n'y a souvent pas de signe au début.")).toBe(1);
    expect(negationCount('Pas encore assez de mesures.')).toBe(1);
    expect(negationCount("Il n'y a pas encore assez de mesures.")).toBe(1);
    expect(negationCount('Ne conduisez pas tant que vous ne vous sentez pas bien.')).toBe(2);
    expect(negationCount('Un soda non allégé, sans attendre.')).toBe(2);
    expect(negationCount('Elle ne baisse jamais.')).toBe(1);
    expect(negationCount('Vos mesures sont plus hautes le soir.')).toBe(0); // « plus » sans « ne »
    expect(negationCount('Vous ne mesurez plus le soir.')).toBe(1);
    // « n' » sans « pas » (« ne … que ») reste une négation : la perdre change le sens.
    expect(negationCount("Afyabora n'enregistre que des mesures.")).toBe(1);
    expect(negationCount('Afyabora n’enregistre que des mesures.')).toBe(1);
    expect(negationCount('Afyabora enregistre des mesures.')).toBe(0);
  });

  it('une négation perdue est refusée même quand elle était écrite autrement', () => {
    const source = 'Prenez un petit verre de jus ou de soda non allégé dans la cuisine.';
    expect(
      checkAnswerRewrite(source, 'Prenez un petit verre de jus ou de soda allégé dans la cuisine.'),
    ).toBe('negation');
    expect(
      checkAnswerRewrite(
        source,
        'Prenez un petit verre de jus ou de soda qui ne soit pas allégé dans la cuisine.',
      ),
    ).toBeNull();
  });

  it('le chiffre de « HbA1c » ne fait pas refuser une reformulation fidèle', () => {
    const source = "L'HbA1c reflète la moyenne de vos glycémies des 2 à 3 derniers mois.";
    expect(
      checkAnswerRewrite(
        source,
        'Elle reflète la moyenne de vos glycémies des 2 à 3 derniers mois.',
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------- Vérification
describe('vérification de la mise en mots', () => {
  it('accepte une reformulation fidèle', () => {
    expect(checkAnswerRewrite(BODY, GOOD)).toBeNull();
  });

  it('refuse une réponse vide', () => {
    expect(checkAnswerRewrite(BODY, '')).toBe('empty');
  });

  it('refuse une réponse trop longue (facteur et plafond absolu)', () => {
    const limit = BODY.length * LENGTH_FACTOR + 120;
    expect(checkAnswerRewrite(BODY, GOOD.padEnd(Math.floor(limit), ' x'))).toBeNull();
    expect(checkAnswerRewrite(BODY, GOOD.padEnd(Math.floor(limit) + 1, ' x'))).toBe('too-long');
    const long = 'Phrase de la fiche. '.repeat(80); // 1 600 caractères
    expect(checkAnswerRewrite(long, long.slice(0, MAX_ANSWER_LENGTH + 1))).toBe('too-long');
    expect(checkAnswerRewrite(long, long.slice(0, MAX_ANSWER_LENGTH))).not.toBe('too-long');
  });

  it('refuse une réponse qui a perdu une partie du gabarit (trop courte)', () => {
    const min = Math.ceil(BODY.length * MIN_LENGTH_RATIO);
    expect(checkAnswerRewrite(BODY, 'x'.repeat(min - 1))).toBe('too-short');
    expect(checkAnswerRewrite(BODY, 'x'.repeat(min))).not.toBe('too-short');
  });

  it('refuse un nombre changé, ajouté ou perdu', () => {
    expect(checkAnswerRewrite(BODY, GOOD.replace('70', '60'))).toBe('numbers');
    expect(checkAnswerRewrite(BODY, `${GOOD} Comptez 15 minutes.`)).toBe('numbers');
    expect(checkAnswerRewrite(BODY, GOOD.replace('sous 70 mg/dL', 'très basse'))).toBe('numbers');
  });

  it('refuse une négation perdue ou ajoutée', () => {
    expect(checkAnswerRewrite(BODY, GOOD.replace('Ne conduisez pas', 'Conduisez'))).toBe(
      'negation',
    );
    expect(checkAnswerRewrite(BODY, GOOD.replace('mesurez', 'ne mesurez pas'))).toBe('negation');
  });

  it('refuse un mot interdit ABSENT du gabarit, accepte celui que la fiche contient déjà', () => {
    expect(checkAnswerRewrite(BODY, GOOD.replace('peut donner', 'est grave et peut donner'))).toBe(
      'forbidden',
    );
    expect(checkAnswerRewrite(BODY, `${GOOD} Prenez votre insuline.`)).toBe('forbidden');
    const withTreatment = `${BODY} Votre traitement peut être adapté par votre médecin.`;
    expect(
      checkAnswerRewrite(withTreatment, `${GOOD} Votre médecin peut adapter votre traitement.`),
    ).toBeNull();
  });

  it('refuse une fausse citation : « … » absent du gabarit, ou une fiche / source nommée', () => {
    expect(checkAnswerRewrite(BODY, GOOD.replace('un malaise', 'un « malaise soudain »'))).toBe(
      'citation',
    );
    expect(checkAnswerRewrite(BODY, `${GOOD} Voir la fiche.`)).toBe('citation');
    expect(checkAnswerRewrite(BODY, `${GOOD} Selon nos sources.`)).toBe('citation');
    const quoted = 'Le créneau « soir » compte plus de valeurs hautes que les autres créneaux.';
    expect(
      checkAnswerRewrite(
        quoted,
        'Le créneau « soir » a plus de valeurs hautes que les autres créneaux.',
      ),
    ).toBeNull();
  });

  it('refuse une réponse qui n’est pas en français', () => {
    const english =
      'Low blood sugar is below 70 mg/dL and you may feel unwell. If you have signs, check your sugar. Do not drive until you feel well.';
    expect(looksFrench(english)).toBe(false);
    expect(looksFrench(GOOD)).toBe(true);
    // Deux mots anglais suffisent à refuser, même au milieu d'un texte surtout français.
    expect(looksFrench('Votre glycémie est dans la cible, the trend is good.')).toBe(false);
    expect(looksFrench('Votre glycémie est dans la cible, the tendance est bonne.')).toBe(true);
    expect(checkAnswerRewrite(BODY, english)).toBe('language');
  });

  it('refuse une réponse qui ajoute des informations (trop de mots nouveaux)', () => {
    const added =
      'On parle de glycémie trop basse sous 70 mg/dL : elle peut donner un malaise.\n\nSi des signes apparaissent, mesurez votre glycémie. Ne conduisez pas tant que vous ne vous sentez pas bien. Gardez toujours biscuits, bonbons, compotes, boissons sucrées, fruits secs près du lit, dans votre voiture, votre sacoche, votre bureau.';
    expect(newWordsRatio(BODY, added)).toBeGreaterThan(MAX_NEW_WORDS_RATIO);
    // « toujours » serait aussi refusé : on vérifie ici la règle des mots nouveaux seule.
    expect(checkAnswerRewrite(BODY, added.replace('toujours ', ''))).toBe('new-words');
    expect(newWordsRatio(BODY, GOOD)).toBeLessThanOrEqual(MAX_NEW_WORDS_RATIO);
  });

  it('les mots de liaison et les variantes d’un même mot ne comptent pas comme nouveaux', () => {
    expect(newWordsRatio('Mesurez votre glycémie.', 'Également, mesurez votre glycémie.')).toBe(0);
    expect(newWordsRatio('Observation du soir.', 'On observe le soir.')).toBe(0);
    expect(newWordsRatio('Texte.', 'Court.')).toBe(0); // aucun mot long : rien à comparer
  });
});

// ---------------------------------------------------------------- Fournisseur : arrêt demandé
describe('OllamaProvider : arrêt demandé par l’appelant', () => {
  it('un arrêt (délai de 2 minutes) coupe l’appel et lève LlmError(timeout)', async () => {
    const fetchFn = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('stop'), { name: 'AbortError' })),
          );
        }),
    );
    const provider = new OllamaProvider(
      { url: 'http://localhost:11434', model: 'mistral-nemo', timeoutMs: 60_000 },
      fetchFn as unknown as typeof fetch,
    );
    const controller = new AbortController();
    const pending = provider.generate({ system: 's', prompt: 'p', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('sans arrêt demandé, le délai propre au fournisseur s’applique toujours', async () => {
    const fetchFn = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('stop'), { name: 'TimeoutError' })),
          );
        }),
    );
    const provider = new OllamaProvider(
      { url: 'http://localhost:11434', model: 'mistral-nemo', timeoutMs: 20 },
      fetchFn as unknown as typeof fetch,
    );
    await expect(provider.generate({ system: 's', prompt: 'p' })).rejects.toMatchObject({
      reason: 'timeout',
    });
  });
});

// ---------------------------------------------------------------- File de mise en mots
const KEY = randomBytes(32).toString('base64');
const config = { getOrThrow: () => KEY } as unknown as ConfigService;

interface Row {
  id: string;
  patientId: string;
  status: 'PENDING' | 'READY';
  textEncrypted: string | null;
  rephrased: boolean;
  createdAt: Date;
}
let rows: Row[] = [];
const prisma = {
  assistantMessage: {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; patientId?: string; status?: string; createdAt?: { lt: Date } };
        data: Partial<Row>;
      }) => {
        const hit = rows.filter(
          (r) =>
            (where.id === undefined || r.id === where.id) &&
            (where.patientId === undefined || r.patientId === where.patientId) &&
            (where.status === undefined || r.status === where.status) &&
            (where.createdAt === undefined || r.createdAt < where.createdAt.lt),
        );
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    ),
  },
} as unknown as PrismaService;

const REWRITE: AnswerRewrite = { prefix: 'Avant : ', body: BODY, suffix: ' Rappel.' };

/** Faux modèle : répond `texte` (ou lève l'erreur donnée), en notant chaque demande. */
function fakeLlm(answer: () => Promise<string>): LlmProvider & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    name: 'faux',
    model: 'faux-modele',
    requests,
    generate: (request) => {
      requests.push(request);
      return answer();
    },
  };
}
const json = (texte: string) => async () => JSON.stringify({ texte });

/** Une réponse PENDING en base, et la tâche correspondante. */
function pendingJob(askedAt = new Date(), patientId = 'awa'): RewriteJob {
  const id = randomUUID();
  rows.push({
    id,
    patientId,
    status: 'PENDING',
    textEncrypted: 'gabarit-chiffre',
    rephrased: false,
    createdAt: askedAt,
  });
  return { answerId: id, rewrite: REWRITE, askedAt };
}
const rowOf = (job: RewriteJob) => rows.find((r) => r.id === job.answerId)!;

describe('AnswerWriter : file de mise en mots', () => {
  let audit: AuditEntry[];
  const auditService = {
    record: async (entry: AuditEntry) => {
      audit.push(entry);
    },
  } as unknown as LlmAuditService;
  let logs: string[];

  beforeEach(() => {
    rows = [];
    audit = [];
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('acceptée : le texte du modèle, entouré de la citation et du rappel, remplace le gabarit', async () => {
    const llm = fakeLlm(json(GOOD));
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const job = pendingJob();
    writer.enqueue(job);
    await writer.idle();

    const row = rowOf(job);
    expect(row.status).toBe('READY');
    expect(row.rephrased).toBe(true);
    expect(decryptField(row.textEncrypted!, KEY)).toBe(`Avant : ${GOOD} Rappel.`);
    // Le modèle n'a reçu que le corps, avec la consigne et le délai.
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]).toMatchObject({
      system: ANSWER_SYSTEM,
      prompt: buildAnswerPrompt(BODY),
    });
    expect(llm.requests[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(audit).toEqual([
      expect.objectContaining({
        provider: 'faux',
        model: 'faux-modele',
        kind: 'ASSISTANT',
        system: ANSWER_SYSTEM,
        inputs: [BODY],
        output: JSON.stringify({ texte: GOOD }),
        outcome: 'OK',
        decisions: ['accepted'],
      }),
    ]);
  });

  it('refusée par la vérification : le gabarit est gardé, la raison est journalisée', async () => {
    const writer = new AnswerWriter(
      prisma,
      config,
      fakeLlm(json(GOOD.replace('70', '60'))),
      auditService,
    );
    const job = pendingJob();
    writer.enqueue(job);
    await writer.idle();

    expect(rowOf(job)).toMatchObject({
      status: 'READY',
      rephrased: false,
      textEncrypted: 'gabarit-chiffre',
    });
    expect(audit[0]).toMatchObject({ outcome: 'OK', decisions: ['numbers'] });
    expect(logs.some((l) => l.includes('refusée [numbers]'))).toBe(true);
  });

  it('réponse illisible : gabarit, journal FORMAT, et pause', async () => {
    const llm = fakeLlm(async () => 'pas du json');
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const job = pendingJob();
    writer.enqueue(job);
    await writer.idle();

    expect(rowOf(job)).toMatchObject({ status: 'READY', rephrased: false });
    expect(audit[0]).toMatchObject({ outcome: 'FORMAT', output: 'pas du json', decisions: [] });
    expect(
      writer.willRewrite({
        kind: 'SHEET',
        text: 't',
        sources: [],
        rephrased: false,
        rewrite: REWRITE,
      }),
    ).toBe(false);
  });

  it('modèle injoignable : gabarit, pause d’une minute (réponses prêtes tout de suite), puis reprise', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const llm = fakeLlm(async () => {
      throw new LlmError('unreachable');
    });
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const answer = {
      kind: 'SHEET' as const,
      text: 't',
      sources: [],
      rephrased: false,
      rewrite: REWRITE,
    };
    const job = pendingJob(new Date(now));
    expect(writer.willRewrite(answer)).toBe(true);
    writer.enqueue(job);
    await writer.idle();

    expect(rowOf(job)).toMatchObject({ status: 'READY', rephrased: false });
    expect(audit[0]).toMatchObject({ outcome: 'UNREACHABLE', output: null });
    expect(writer.willRewrite(answer)).toBe(false);
    now += RETRY_AFTER_MS - 1;
    expect(writer.willRewrite(answer)).toBe(false);
    now += 1;
    expect(writer.willRewrite(answer)).toBe(true);
  });

  it('délai de 2 minutes : l’appel est arrêté, gabarit, journal TIMEOUT, SANS pause (modèle lent, pas en panne)', async () => {
    // Faux modèle qui ne répond jamais et ignore l'arrêt : le délai coupe quand même l'attente.
    const llm = fakeLlm(() => new Promise<string>(() => undefined));
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    writer.deadlineMs = 40;
    const job = pendingJob();
    writer.enqueue(job);
    await writer.idle();

    expect(rowOf(job)).toMatchObject({ status: 'READY', rephrased: false });
    expect(llm.requests[0]!.signal!.aborted).toBe(true);
    expect(audit[0]).toMatchObject({ outcome: 'TIMEOUT', output: null });
    expect(logs.some((l) => l.includes('délai de 2 minutes'))).toBe(true);
    expect(
      writer.willRewrite({
        kind: 'SHEET',
        text: 't',
        sources: [],
        rephrased: false,
        rewrite: REWRITE,
      }),
    ).toBe(true);
  });

  it('délai déjà dépassé quand vient son tour : gabarit sans appeler le modèle', async () => {
    const llm = fakeLlm(json(GOOD));
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const job = pendingJob(new Date(Date.now() - ANSWER_DEADLINE_MS));
    writer.enqueue(job);
    await writer.idle();

    expect(rowOf(job)).toMatchObject({ status: 'READY', rephrased: false });
    expect(llm.requests).toHaveLength(0);
    expect(audit).toHaveLength(0);
  });

  it('une seule réponse à la fois, dans l’ordre d’arrivée', async () => {
    let active = 0;
    let most = 0;
    const order: string[] = [];
    const llm: LlmProvider = {
      name: 'faux',
      model: 'm',
      generate: async ({ prompt }) => {
        active += 1;
        most = Math.max(most, active);
        order.push(prompt);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return JSON.stringify({ texte: GOOD });
      },
    };
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const jobs = [0, 1, 2].map(() => pendingJob());
    jobs.forEach((job, i) =>
      writer.enqueue({ ...job, rewrite: { ...REWRITE, body: `${BODY} (${i})` } }),
    );
    await writer.idle();

    expect(most).toBe(1);
    expect(order).toEqual([0, 1, 2].map((i) => buildAnswerPrompt(`${BODY} (${i})`)));
  });

  it('file pleine : la réponse suivante est prête tout de suite (gabarit)', async () => {
    const llm = fakeLlm(() => new Promise<string>(() => undefined));
    const writer = new AnswerWriter(prisma, config, llm, auditService);
    const answer = {
      kind: 'SHEET' as const,
      text: 't',
      sources: [],
      rephrased: false,
      rewrite: REWRITE,
    };
    // La 1re tâche est en cours (sortie de la file) ; MAX_QUEUE autres attendent.
    for (let i = 0; i <= MAX_QUEUE; i++) writer.enqueue(pendingJob());
    await Promise.resolve();
    expect(writer.willRewrite(answer)).toBe(false);
  });

  it('sans modèle, ou réponse sans partie à mettre en mots (urgence, refus) : jamais de file', () => {
    const none = new AnswerWriter(prisma, config, null, auditService);
    expect(
      none.willRewrite({
        kind: 'SHEET',
        text: 't',
        sources: [],
        rephrased: false,
        rewrite: REWRITE,
      }),
    ).toBe(false);
    const writer = new AnswerWriter(prisma, config, fakeLlm(json(GOOD)), auditService);
    expect(
      writer.willRewrite({ kind: 'EMERGENCY', text: 't', sources: [], rephrased: false }),
    ).toBe(false);
  });

  it('réponse effacée pendant la mise en mots : rien n’est recréé, aucune erreur', async () => {
    const writer = new AnswerWriter(prisma, config, fakeLlm(json(GOOD)), auditService);
    const job = pendingJob();
    rows = [];
    writer.enqueue(job);
    await writer.idle();
    expect(rows).toEqual([]);
  });

  it('base indisponible à l’enregistrement : avertissement sans texte, la file continue', async () => {
    const writer = new AnswerWriter(prisma, config, fakeLlm(json(GOOD)), auditService);
    vi.mocked(prisma.assistantMessage.updateMany).mockRejectedValueOnce(new Error('base'));
    const first = pendingJob();
    const second = pendingJob();
    writer.enqueue(first);
    writer.enqueue(second);
    await writer.idle();
    expect(rowOf(first).status).toBe('PENDING'); // reprise par la prochaine lecture
    expect(rowOf(second)).toMatchObject({ status: 'READY', rephrased: true });
    expect(logs.some((l) => l.includes('non enregistrée'))).toBe(true);
  });

  it('démarrage : les réponses restées en préparation passent en gabarit', async () => {
    const writer = new AnswerWriter(prisma, config, fakeLlm(json(GOOD)), auditService);
    const a = pendingJob();
    const b = pendingJob(new Date(), 'paul');
    await writer.onModuleInit();
    expect(rowOf(a).status).toBe('READY');
    expect(rowOf(b).status).toBe('READY');
    expect(logs.some((l) => l.includes('2 réponse(s)'))).toBe(true);
  });

  it('lecture : seules les réponses DE CE PATIENT en retard (délai + marge) passent en gabarit', async () => {
    const writer = new AnswerWriter(prisma, config, null, auditService);
    const late = new Date(Date.now() - ANSWER_DEADLINE_MS - OVERDUE_GRACE_MS - 1);
    const old = pendingJob(late);
    const recent = pendingJob(new Date(Date.now() - ANSWER_DEADLINE_MS - OVERDUE_GRACE_MS + 1000));
    const other = pendingJob(late, 'paul');
    await writer.settleOverdue('awa');
    expect(rowOf(old).status).toBe('READY');
    expect(rowOf(recent).status).toBe('PENDING');
    expect(rowOf(other).status).toBe('PENDING');
  });

  it('aucun texte dans les journaux (ni corps, ni réponse du modèle)', async () => {
    const writer = new AnswerWriter(prisma, config, fakeLlm(json(GOOD)), auditService);
    writer.enqueue(pendingJob());
    writer.enqueue(pendingJob());
    await writer.idle();
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain('glycémie');
      expect(line).not.toContain('70');
    }
  });
});
