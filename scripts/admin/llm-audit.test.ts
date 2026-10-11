// Ticket L3-10 : lecture du journal d'audit du modèle de langage, avec une fausse base et un faux
// déchiffrement (aucune base nécessaire). Lancé par `pnpm --filter @glyka/scripts test`.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { run } from './llm-audit-cli.ts';
import { formatRow, isProblem, parseArgs, type AuditQuery, type AuditRow } from './llm-audit.ts';

const row = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  createdAt: new Date(Date.UTC(2026, 9, 11, 14, 5)),
  provider: 'ollama',
  model: 'mistral-nemo',
  kind: 'SENTENCES',
  promptHash: '1a2b3c4d5e6f',
  outcome: 'OK',
  durationMs: 95_789,
  accepted: 4,
  refused: 1,
  decisions: ['accepted', 'numbers', 'accepted', 'accepted', 'accepted'],
  inputEncrypted: 'CHIFFRE:["Phrase 1","Phrase 2","Phrase 3","Phrase 4","Phrase 5"]',
  outputEncrypted: 'CHIFFRE:{"textes": ["…"]}',
  ...overrides,
});

/** Faux déchiffrement : enlève le préfixe « CHIFFRE: » (le vrai est testé dans l'API). */
const decrypt = (payload: string) => payload.replace(/^CHIFFRE:/, '');

async function runWith(argv: string[], rows: AuditRow[]) {
  const printed: string[] = [];
  const queries: AuditQuery[] = [];
  const code = await run(argv, {
    read: async (query) => {
      queries.push(query);
      return rows;
    },
    decrypt,
    print: (text) => printed.push(text),
  });
  return { code, out: printed.join('\n'), queries };
}

describe('arguments', () => {
  test('par défaut : les 20 plus récents, sans texte', () => {
    assert.deepEqual(parseArgs([]), {
      kind: 'list',
      query: { limit: 20, problemsOnly: false, details: false },
    });
  });

  test('--limit, --problems, --details', () => {
    assert.deepEqual(parseArgs(['--limit=5', '--problems', '--details']), {
      kind: 'list',
      query: { limit: 5, problemsOnly: true, details: true },
    });
  });

  test('erreurs : limite hors bornes, option inconnue, argument en trop', () => {
    assert.ok('error' in parseArgs(['--limit=0']));
    assert.ok('error' in parseArgs(['--limit=500']));
    assert.ok('error' in parseArgs(['--limit=abc']));
    assert.ok('error' in parseArgs(['--tout']));
    assert.ok('error' in parseArgs(['effacer']));
  });
});

describe('affichage', () => {
  test('une ligne de résumé : date UTC, modèle, type, décisions, durée, consigne — SANS texte', () => {
    assert.equal(
      formatRow(row()),
      '2026-10-11 14:05 UTC · ollama/mistral-nemo · phrases · 4 accepté(s), 1 refusé(s) [numbers] · 95,8 s · consigne 1a2b3c4d5e6f',
    );
    assert.equal(
      formatRow(row({ kind: 'SUMMARY', outcome: 'TIMEOUT', durationMs: 90_000 })),
      '2026-10-11 14:05 UTC · ollama/mistral-nemo · résumé · trop lent · 90,0 s · consigne 1a2b3c4d5e6f',
    );
  });

  test('« à examiner » : un refus ou un échec du modèle', () => {
    assert.equal(isProblem(row()), true);
    assert.equal(isProblem(row({ refused: 0, decisions: ['accepted'] })), false);
    assert.equal(isProblem(row({ refused: 0, outcome: 'UNREACHABLE' })), true);
  });

  test('sans --details : aucun texte affiché (ni envoyé, ni reçu)', async () => {
    const { code, out } = await runWith([], [row()]);
    assert.equal(code, 0);
    assert.match(out, /1 appel\(s\), du plus récent au plus ancien/);
    assert.doesNotMatch(out, /Phrase 1|textes/);
  });

  test('--details : textes envoyés avec la décision de chacun, puis la réponse brute', async () => {
    const { out } = await runWith(['--details'], [row()]);
    assert.match(out, /\[accepted\] Phrase 1/);
    assert.match(out, /\[numbers\] Phrase 2/);
    assert.match(out, /Réponse du modèle :\n {4}\{"textes": \["…"\]\}/);
  });

  test('--details : réponse sur plusieurs lignes, chaque ligne décalée', async () => {
    const { out } = await runWith(
      ['--details'],
      [row({ outputEncrypted: 'CHIFFRE:{\n  "texte": "…"\n}' })],
    );
    assert.match(out, /Réponse du modèle :\n {4}\{\n {6}"texte": "…"\n {4}\}/);
  });

  test('--details sans réponse du modèle : « (pas de réponse) »', async () => {
    const { out } = await runWith(
      ['--details'],
      [row({ outcome: 'TIMEOUT', outputEncrypted: null, decisions: [], accepted: 0, refused: 0 })],
    );
    assert.match(out, /\[sans décision\] Phrase 1/);
    assert.match(out, /\(pas de réponse\)/);
  });

  test('journal vide, ou rien à examiner : message clair', async () => {
    assert.match((await runWith([], [])).out, /journal d'audit est vide/);
    assert.match((await runWith(['--problems'], [])).out, /Aucun appel à examiner/);
  });

  test('commande mal écrite : code 2 et mode d’emploi', async () => {
    const { code, out } = await runWith(['--limit=0'], [row()]);
    assert.equal(code, 2);
    assert.match(out, /usage/);
  });
});
