// Ticket L1-12 : administration des comptes médecins, avec un faux stockage et un faux terminal
// (aucune base nécessaire). Lancé par `pnpm --filter @glyka/scripts test`.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { DoctorStore, RejectEffects } from './doctor-store.ts';
import { run } from './doctors-cli.ts';
import { errorSummary, formatTable, parseArgs, planAction, type DoctorAccount } from './doctors.ts';

const NOW = new Date(Date.UTC(2026, 9, 10, 15, 0));

function doctor(overrides: Partial<DoctorAccount> = {}): DoctorAccount {
  return {
    userId: 'd1',
    email: 'dr.amina@example.org',
    firstName: 'Amina',
    lastName: 'Kabila',
    licenseNumber: 'CNOM-12345',
    institution: 'Hôpital de référence',
    status: 'PENDING',
    emailVerifiedAt: new Date(Date.UTC(2026, 9, 9)),
    verifiedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 9)),
    ...overrides,
  };
}

/** Faux stockage en mémoire : garde la trace de ce qui a été modifié. */
function fakeStore(
  accounts: DoctorAccount[],
  effects: RejectEffects = { revokedSessions: 2, endedShares: 1 },
) {
  const calls: string[] = [];
  const store: DoctorStore = {
    list: async (status) => accounts.filter((a) => status === 'ALL' || a.status === status),
    find: async (email) => accounts.find((a) => a.email === email) ?? null,
    approve: async (userId, now) => {
      calls.push(`approve:${userId}:${now.toISOString()}`);
    },
    reject: async (userId, now) => {
      calls.push(`reject:${userId}:${now.toISOString()}`);
      return effects;
    },
  };
  return { store, calls };
}

async function exec(
  argv: string[],
  store: DoctorStore,
  answer: boolean | null = true,
): Promise<{ code: number; out: string; asked: string[] }> {
  const lines: string[] = [];
  const asked: string[] = [];
  const code = await run(argv, {
    store,
    confirm:
      answer === null
        ? null
        : async (question) => {
            asked.push(question);
            return answer;
          },
    print: (text) => lines.push(text),
    now: () => NOW,
  });
  return { code, out: lines.join('\n'), asked };
}

describe('arguments', () => {
  test('sans argument : liste des comptes en attente', () => {
    assert.deepEqual(parseArgs([]), { kind: 'list', status: 'PENDING' });
    assert.deepEqual(parseArgs(['--', 'list']), { kind: 'list', status: 'PENDING' });
  });

  test('liste filtrée ou complète', () => {
    assert.deepEqual(parseArgs(['list', '--all']), { kind: 'list', status: 'ALL' });
    assert.deepEqual(parseArgs(['list', '--status=approved']), {
      kind: 'list',
      status: 'APPROVED',
    });
    assert.ok('error' in parseArgs(['list', '--status=SUPER']));
  });

  test('approbation : email en minuscules, --yes reconnu', () => {
    assert.deepEqual(parseArgs(['approve', 'Dr.Amina@Example.ORG', '--yes']), {
      kind: 'approve',
      email: 'dr.amina@example.org',
      yes: true,
    });
  });

  test('commandes mal écrites refusées avec un message', () => {
    assert.ok('error' in parseArgs(['approve']));
    assert.ok('error' in parseArgs(['approve', 'pas-une-adresse']));
    assert.ok('error' in parseArgs(['supprimer', 'a@b.org']));
    assert.ok('error' in parseArgs(['approve', 'a@b.org', '--force']));
    assert.ok('error' in parseArgs(['approve', 'a@b.org', 'c@d.org']));
  });
});

describe('règles', () => {
  test('approuver un compte en attente dont l’adresse est confirmée', () => {
    assert.equal(planAction(doctor(), 'approve').kind, 'change');
  });

  test('approbation refusée si l’adresse email n’est pas confirmée', () => {
    const plan = planAction(doctor({ emailVerifiedAt: null }), 'approve');
    assert.equal(plan.kind, 'refused');
  });

  test('refaire la même action ne change rien', () => {
    assert.equal(planAction(doctor({ status: 'APPROVED' }), 'approve').kind, 'noop');
    assert.equal(planAction(doctor({ status: 'REJECTED' }), 'reject').kind, 'noop');
  });

  test('réexamen (refusé → approuvé) et suspension (approuvé → refusé) possibles', () => {
    assert.deepEqual(planAction(doctor({ status: 'REJECTED' }), 'approve').kind, 'change');
    const suspend = planAction(doctor({ status: 'APPROVED' }), 'reject');
    assert.equal(suspend.kind, 'change');
    assert.match(suspend.kind === 'change' ? suspend.summary : '', /sessions ouvertes/);
  });
});

describe('outil en ligne de commande', () => {
  test('approuve après confirmation, avec la date du jour', async () => {
    const { store, calls } = fakeStore([doctor()]);
    const result = await exec(['approve', 'dr.amina@example.org'], store, true);
    assert.equal(result.code, 0);
    assert.deepEqual(calls, [`approve:d1:${NOW.toISOString()}`]);
    assert.equal(result.asked.length, 1);
    assert.match(result.out, /APPROUVÉ/);
    assert.match(result.out, /se reconnecter/);
    // C'est l'API qui prévient le médecin : l'outil le dit (plus de « Prévenez le médecin »).
    assert.match(result.out, /recevra un email avec cette décision/);
  });

  test('« non » à la confirmation : rien n’est modifié', async () => {
    const { store, calls } = fakeStore([doctor()]);
    const result = await exec(['approve', 'dr.amina@example.org'], store, false);
    assert.equal(result.code, 0);
    assert.deepEqual(calls, []);
    assert.match(result.out, /Annulé/);
  });

  test('sans terminal et sans --yes : refus, rien n’est modifié', async () => {
    const { store, calls } = fakeStore([doctor()]);
    const result = await exec(['approve', 'dr.amina@example.org'], store, null);
    assert.equal(result.code, 1);
    assert.deepEqual(calls, []);
  });

  test('--yes : pas de question', async () => {
    const { store, calls } = fakeStore([doctor()]);
    const result = await exec(['approve', 'dr.amina@example.org', '--yes'], store, null);
    assert.equal(result.code, 0);
    assert.equal(result.asked.length, 0);
    assert.equal(calls.length, 1);
  });

  test('refus d’un compte approuvé : affiche les sessions et partages fermés', async () => {
    const { store, calls } = fakeStore([doctor({ status: 'APPROVED' })]);
    const result = await exec(['reject', 'dr.amina@example.org', '--yes'], store);
    assert.equal(result.code, 0);
    assert.deepEqual(calls, [`reject:d1:${NOW.toISOString()}`]);
    assert.match(result.out, /Sessions de connexion fermées : 2/);
    assert.match(result.out, /partages en cours arrêtés : 1/);
    assert.match(result.out, /recevra un email avec cette décision/);
  });

  test('adresse non confirmée : approbation refusée, aucune question, rien modifié', async () => {
    const { store, calls } = fakeStore([doctor({ emailVerifiedAt: null })]);
    const result = await exec(['approve', 'dr.amina@example.org'], store);
    assert.equal(result.code, 1);
    assert.equal(result.asked.length, 0);
    assert.deepEqual(calls, []);
  });

  test('compte inconnu ou commande mal écrite : code d’erreur', async () => {
    const { store } = fakeStore([]);
    assert.equal((await exec(['show', 'inconnu@example.org'], store)).code, 1);
    assert.equal((await exec(['approve'], store)).code, 2);
  });

  test('liste des comptes en attente', async () => {
    const { store } = fakeStore([
      doctor(),
      doctor({ userId: 'd2', email: 'dr.paul@example.org', status: 'APPROVED' }),
    ]);
    const result = await exec([], store);
    assert.equal(result.code, 0);
    assert.match(result.out, /1 compte en attente :/);
    assert.match(result.out, /dr\.amina@example\.org/);
    assert.doesNotMatch(result.out, /dr\.paul/);
  });
});

describe('affichage', () => {
  test('accord au pluriel : « 2 comptes approuvés », « 1 compte refusé »', async () => {
    const approved = fakeStore([
      doctor({ status: 'APPROVED' }),
      doctor({ userId: 'd2', email: 'dr.paul@example.org', status: 'APPROVED' }),
    ]).store;
    assert.match(
      (await exec(['list', '--status=APPROVED'], approved)).out,
      /2 comptes approuvés :/,
    );
    const rejected = fakeStore([doctor({ status: 'REJECTED' })]).store;
    assert.match((await exec(['list', '--status=REJECTED'], rejected)).out, /1 compte refusé :/);
    assert.match((await exec(['list'], fakeStore([]).store)).out, /Aucun compte en attente\./);
  });

  test('colonnes alignées et textes trop longs coupés', () => {
    const table = formatTable([
      doctor({ institution: 'Centre hospitalier universitaire de référence' }),
    ]);
    const [header, rule, row] = table.split('\n');
    assert.ok(header && rule && row);
    assert.equal(header.indexOf('Statut'), row.indexOf('en attente'));
    assert.match(row, /…/);
  });
});

describe('erreurs', () => {
  // Messages RÉELS de Prisma 5.22 (relevés le 2026-10-19) : la vraie cause est après l'en-tête « Invalid … ».
  const invocation = (cause: string) =>
    new Error(`\nInvalid \`prisma.doctorProfile.findMany()\` invocation:\n\n\n${cause}`);

  test('base injoignable : la cause est affichée (avant : « ✖ » seul)', () => {
    assert.equal(
      errorSummary(
        invocation(
          "Can't reach database server at `127.0.0.1:5999`\n\nPlease make sure your database server is running at `127.0.0.1:5999`.",
        ),
      ),
      "Can't reach database server at `127.0.0.1:5999`",
    );
  });

  test('adresse de la base vide ou mal collée : cause + conseil', () => {
    const summary = errorSummary(
      invocation(
        'error: Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.\n  -->  schema.prisma:9',
      ),
    );
    assert.match(summary, /^Error validating datasource `db`: the URL must start/);
    assert.match(summary, /DATABASE_URL est vide ou mal collée/);
  });

  test('erreur ordinaire : sa première ligne ; message vide : son type', () => {
    assert.equal(errorSummary(new Error('Panne\ndétails')), 'Panne');
    assert.equal(errorSummary(new TypeError('')), 'TypeError');
    assert.equal(errorSummary('texte'), 'texte');
  });
});
