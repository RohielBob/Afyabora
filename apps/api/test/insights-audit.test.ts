// Tests du ticket L3-10 : journal d'audit des appels au modèle de langage (une ligne par appel, textes
// chiffrés, aucun identifiant de patient, conservation 90 jours, ne bloque jamais l'analyse).
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightWithText } from '@glyka/analytics';
import { decryptField } from '../src/common/crypto/field-encryption';
import { InsightWriter } from '../src/modules/insights/llm/insight-writer.service';
import {
  AUDIT_RETENTION_DAYS,
  LlmAuditService,
  promptHash,
  type AuditEntry,
} from '../src/modules/insights/llm/llm-audit.service';
import { LlmError, type LlmProvider } from '../src/modules/insights/llm/llm-provider';
import { REPHRASE_SYSTEM, SUMMARY_SYSTEM } from '../src/modules/insights/llm/rephrase';
import type { PrismaService } from '../src/prisma/prisma.service';

const KEY = randomBytes(32).toString('base64');
const NOW = Date.UTC(2026, 9, 11, 12);
const DAY = 86_400_000;

const HYPO = "J'observe 2 mesures sous le seuil bas au cours des 7 derniers jours.";
const COMPARISON = 'Temps dans la cible : 70 % (période précédente : 50 %).';

type Row = Record<string, unknown>;

/** Fausse base : garde les lignes écrites et la dernière demande d'effacement. */
function fakePrisma(failing = false) {
  const rows: Row[] = [];
  const deletes: { where: { createdAt: { lt: Date } } }[] = [];
  const prisma = {
    llmAuditLog: {
      create: async ({ data }: { data: Row }) => {
        if (failing) throw new Error('base indisponible : ' + JSON.stringify(data));
        rows.push(data);
        return data;
      },
      deleteMany: async (args: { where: { createdAt: { lt: Date } } }) => {
        deletes.push(args);
        return { count: 0 };
      },
    },
  } as unknown as PrismaService;
  return { prisma, rows, deletes };
}

const config = { getOrThrow: () => KEY } as unknown as ConfigService;

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  provider: 'ollama',
  model: 'mistral-nemo',
  kind: 'SENTENCES',
  system: REPHRASE_SYSTEM,
  inputs: [HYPO, COMPARISON],
  output: '{"textes": ["…", "…"]}',
  outcome: 'OK',
  durationMs: 1234,
  decisions: ['accepted', 'numbers'],
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
describe('LlmAuditService : une ligne par appel', () => {
  it('écrit le fournisseur, le modèle, la consigne (empreinte), le résultat, la durée, les décisions', async () => {
    const { prisma, rows } = fakePrisma();
    await new LlmAuditService(prisma, config).record(entry());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'ollama',
      model: 'mistral-nemo',
      kind: 'SENTENCES',
      promptHash: promptHash(REPHRASE_SYSTEM),
      outcome: 'OK',
      durationMs: 1234,
      accepted: 1,
      refused: 1,
      decisions: ['accepted', 'numbers'],
    });
  });

  it('textes envoyés et réponse CHIFFRÉS : illisibles en base, relus avec la clé', async () => {
    const { prisma, rows } = fakePrisma();
    await new LlmAuditService(prisma, config).record(entry());
    const row = rows[0]!;
    expect(JSON.stringify(row)).not.toContain('seuil bas');
    expect(JSON.stringify(row)).not.toContain('70 %');
    expect(JSON.parse(decryptField(row.inputEncrypted as string, KEY))).toEqual([HYPO, COMPARISON]);
    expect(decryptField(row.outputEncrypted as string, KEY)).toBe('{"textes": ["…", "…"]}');
  });

  it('aucun identifiant de patient (les phrases sont partagées entre patients)', async () => {
    const { prisma, rows } = fakePrisma();
    await new LlmAuditService(prisma, config).record(entry());
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'accepted',
        'decisions',
        'durationMs',
        'inputEncrypted',
        'kind',
        'model',
        'outcome',
        'outputEncrypted',
        'promptHash',
        'provider',
        'refused',
      ].sort(),
    );
  });

  it('modèle sans réponse : pas de réponse chiffrée, aucune décision', async () => {
    const { prisma, rows } = fakePrisma();
    await new LlmAuditService(prisma, config).record(
      entry({ output: null, outcome: 'TIMEOUT', decisions: [] }),
    );
    expect(rows[0]).toMatchObject({
      outcome: 'TIMEOUT',
      outputEncrypted: null,
      accepted: 0,
      refused: 0,
    });
  });

  it(`efface les lignes de plus de ${AUDIT_RETENTION_DAYS} jours à chaque écriture`, async () => {
    const { prisma, deletes } = fakePrisma();
    await new LlmAuditService(prisma, config).record(entry());
    expect(deletes).toEqual([{ where: { createdAt: { lt: new Date(NOW - 90 * DAY) } } }]);
  });

  it('base indisponible : aucune erreur levée, avertissement SANS aucun texte', async () => {
    const warnings: string[] = [];
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      warnings.push(String(m));
    });
    try {
      const { prisma } = fakePrisma(true);
      await expect(new LlmAuditService(prisma, config).record(entry())).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
    expect(warnings).toEqual([
      "Journal d'audit du modèle de langage indisponible : appel non journalisé.",
    ]);
  });

  it('empreinte de consigne : courte, stable, différente pour les phrases et le résumé', () => {
    expect(promptHash(REPHRASE_SYSTEM)).toMatch(/^[0-9a-f]{12}$/);
    expect(promptHash(REPHRASE_SYSTEM)).toBe(promptHash(REPHRASE_SYSTEM));
    expect(promptHash(SUMMARY_SYSTEM)).not.toBe(promptHash(REPHRASE_SYSTEM));
  });
});

// ---------------------------------------------------------------------------------------------
describe('InsightWriter : chaque appel au modèle est journalisé', () => {
  const insights: InsightWithText[] = [HYPO, COMPARISON].map((text) => ({
    type: 'PERIOD_COMPARISON',
    severity: 'INFO',
    facts: {},
    evidenceIds: [],
    text,
  }));
  const BETTER =
    'Vos mesures étaient dans la cible 70 % du temps, contre 50 % sur la période précédente.';

  /** Faux journal : note ce qu'on lui demande d'écrire. */
  function fakeAudit() {
    const entries: AuditEntry[] = [];
    const audit = { record: async (e: AuditEntry) => void entries.push(e) } as LlmAuditService;
    return { audit, entries };
  }

  const model = (generate: LlmProvider['generate']): LlmProvider => ({
    name: 'ollama',
    model: 'mistral-nemo',
    generate,
  });

  it('phrases puis résumé : deux lignes, avec la réponse brute et la décision de chaque texte', async () => {
    const { audit, entries } = fakeAudit();
    const writer = new InsightWriter(
      model(async ({ system }) =>
        system === SUMMARY_SYSTEM
          ? '{"texte": "Résumé reformulé sans les chiffres."}'
          : JSON.stringify({ textes: ['Vous avez eu des mesures basses.', BETTER] }),
      ),
      audit,
    );
    writer.write(insights, 'Sur les 7 derniers jours, 20 mesures.');
    await writer.idle();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      provider: 'ollama',
      model: 'mistral-nemo',
      kind: 'SENTENCES',
      system: REPHRASE_SYSTEM,
      inputs: [HYPO, COMPARISON],
      outcome: 'OK',
      decisions: ['numbers', 'accepted'], // la 1re a perdu ses chiffres
    });
    expect(entries[0]!.output).toContain(BETTER);
    expect(entries[1]).toMatchObject({
      kind: 'SUMMARY',
      system: SUMMARY_SYSTEM,
      inputs: ['Sur les 7 derniers jours, 20 mesures.'],
      outcome: 'OK',
      decisions: ['numbers'],
    });
    expect(entries.every((e) => e.durationMs >= 0)).toBe(true);
  });

  it.each([
    ['trop lent', new LlmError('timeout'), 'TIMEOUT'],
    ['injoignable', new LlmError('unreachable'), 'UNREACHABLE'],
    ['erreur HTTP', new LlmError('http'), 'HTTP'],
    ['erreur inattendue', new Error('panne'), 'UNKNOWN'],
  ] as const)('modèle %s : une ligne « %s », sans réponse', async (_, error, outcome) => {
    const { audit, entries } = fakeAudit();
    const writer = new InsightWriter(
      model(async () => {
        throw error;
      }),
      audit,
    );
    writer.write(insights, 'Résumé.');
    await writer.idle();
    expect(entries).toEqual([
      expect.objectContaining({ kind: 'SENTENCES', outcome, output: null, decisions: [] }),
    ]);
  });

  it('réponse au mauvais format : une ligne FORMAT avec la réponse brute (pour comprendre)', async () => {
    const { audit, entries } = fakeAudit();
    const writer = new InsightWriter(
      model(async () => 'Voici les phrases, désolé pas de JSON'),
      audit,
    );
    writer.write(insights);
    await writer.idle();
    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'SENTENCES',
        outcome: 'FORMAT',
        output: 'Voici les phrases, désolé pas de JSON',
        decisions: [],
      }),
    ]);
  });

  it('sans modèle (LLM_PROVIDER=none) : rien à journaliser', async () => {
    const { audit, entries } = fakeAudit();
    const writer = new InsightWriter(null, audit);
    writer.write(insights, 'Résumé.');
    await writer.idle();
    expect(entries).toEqual([]);
  });

  it('textes déjà connus : pas de nouvel appel, donc pas de nouvelle ligne', async () => {
    const { audit, entries } = fakeAudit();
    const writer = new InsightWriter(
      model(async () => JSON.stringify({ textes: [HYPO, COMPARISON] })),
      audit,
    );
    writer.write(insights);
    await writer.idle();
    writer.write(insights);
    await writer.idle();
    expect(entries).toHaveLength(1);
  });
});
