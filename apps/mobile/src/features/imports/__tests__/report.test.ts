// Tests du ticket L4-07 : rapport d'import, décisions (Corriger · Ignorer · Accepter), import, annulation.
import i18next from 'i18next';
import type { ImportReport } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { ApiError } from '@/lib/api-client';
import {
  REPORT_GROUPS,
  allowedActions,
  buildDecisions,
  checkCorrection,
  chooseForAll,
  commitProblem,
  groupRows,
  importCount,
  pageOf,
  ROWS_PAGE,
  type Choices,
} from '../report';

/** Rapport du fichier de démonstration (147 lignes : 139 / 5 / 3), plus une ligne rejetée. */
const report: ImportReport = {
  batchId: '3f2b8c1e-6a4d-4e1b-9c7a-1d2e3f4a5b6c',
  analyzed: 148,
  valid: 139,
  duplicates: 5,
  inconsistent: 3,
  errors: 1,
  rows: [
    {
      line: 121,
      status: 'INCONSISTENT',
      rawValue: '9,90',
      message: "Valeur inhabituelle, vérifier l'unité (en mmol/L ?)",
    },
    { line: 20, status: 'DUPLICATE', rawValue: '1,32', message: 'Ligne en double dans le fichier' },
    {
      line: 42,
      status: 'INCONSISTENT',
      rawValue: '18,70',
      message: "Valeur inhabituelle, vérifier l'unité (en mmol/L ?)",
    },
    { line: 38, status: 'DUPLICATE', rawValue: '1,20' },
    { line: 65, status: 'DUPLICATE', rawValue: '1,40' },
    { line: 90, status: 'INCONSISTENT', rawValue: '0,02' },
    { line: 104, status: 'DUPLICATE', rawValue: '1,10' },
    { line: 138, status: 'DUPLICATE', rawValue: '1,60' },
    { line: 149, status: 'ERROR', rawValue: 'abc', message: 'Valeur non numérique' },
  ],
};

describe('groupes du rapport', () => {
  it('à vérifier, doublons, erreurs : dans l’ordre du fichier', () => {
    const groups = groupRows(report);
    expect(REPORT_GROUPS).toEqual(['INCONSISTENT', 'DUPLICATE', 'ERROR']);
    expect(groups.INCONSISTENT.map((r) => r.line)).toEqual([42, 90, 121]);
    expect(groups.DUPLICATE.map((r) => r.line)).toEqual([20, 38, 65, 104, 138]);
    expect(groups.ERROR.map((r) => r.line)).toEqual([149]);
  });

  it('une ligne VALID inattendue dans le détail est ignorée (le serveur ne détaille que le reste)', () => {
    const odd = { ...report, rows: [{ line: 2, status: 'VALID' as const, rawValue: '1' }] };
    expect(groupRows(odd)).toEqual({ INCONSISTENT: [], DUPLICATE: [], ERROR: [] });
  });

  it('une ligne rejetée ne peut pas être acceptée telle quelle', () => {
    expect(allowedActions('ERROR')).toEqual(['IGNORE', 'CORRECT']);
    expect(allowedActions('INCONSISTENT')).toEqual(['IGNORE', 'ACCEPT', 'CORRECT']);
    expect(allowedActions('DUPLICATE')).toEqual(['IGNORE', 'ACCEPT', 'CORRECT']);
  });
});

describe('décisions en lot', () => {
  const groups = groupRows(report);

  it('« Tout accepter » les doublons ; une correction en cours est gardée', () => {
    const start: Choices = { 38: { action: 'CORRECT', value: '1,2' } };
    const next = chooseForAll(start, groups.DUPLICATE, 'ACCEPT');
    expect(next).toEqual({
      20: { action: 'ACCEPT' },
      38: { action: 'CORRECT', value: '1,2' },
      65: { action: 'ACCEPT' },
      104: { action: 'ACCEPT' },
      138: { action: 'ACCEPT' },
    });
    expect(chooseForAll(next, groups.DUPLICATE, 'IGNORE')[20]).toEqual({ action: 'IGNORE' });
  });

  it('« Tout accepter » ne touche jamais une ligne rejetée ; les autres choix restent', () => {
    const start: Choices = { 42: { action: 'ACCEPT' } };
    expect(chooseForAll(start, groups.ERROR, 'ACCEPT')).toEqual(start);
  });
});

describe('valeur corrigée', () => {
  it.each([
    [undefined, 'G_L', 'missing'],
    ['  ', 'G_L', 'missing'],
    ['abc', 'G_L', 'invalid'],
    ['0', 'G_L', 'invalid'],
    ['-1,2', 'G_L', 'invalid'],
    ['18,7', 'G_L', 'outOfRange'],
    ['0,1', 'G_L', 'outOfRange'],
    ['1,87', 'G_L', null],
    ['1.87', 'G_L', null],
    ['18,7', 'MMOL_L', null],
    ['110', 'MG_DL', null],
    ['601', 'MG_DL', 'outOfRange'],
  ] as const)('« %s » en %s ⇒ %s', (value, unit, problem) => {
    expect(checkCorrection(value, unit)).toBe(problem);
  });
});

describe('décisions envoyées et nombre de mesures importées', () => {
  it('sans décision : les 139 valides, rien n’est envoyé', () => {
    expect(buildDecisions(report, {}, 'G_L')).toEqual({ decisions: [], problems: {} });
    expect(importCount(report, {})).toBe(139);
  });

  it('scénario de démo : ligne 42 corrigée (1,87), 90 ignorée, 121 acceptée ⇒ 141 mesures', () => {
    const choices: Choices = {
      42: { action: 'CORRECT', value: '1,87' },
      90: { action: 'IGNORE' },
      121: { action: 'ACCEPT' },
    };
    expect(buildDecisions(report, choices, 'G_L')).toEqual({
      decisions: [
        { line: 42, action: 'CORRECT', correctedValue: 1.87 },
        { line: 121, action: 'ACCEPT' },
      ],
      problems: {},
    });
    expect(importCount(report, choices)).toBe(141);
  });

  it('autre unité que celle du fichier : envoyée ; même unité : rien de plus', () => {
    const choices: Choices = {
      42: { action: 'CORRECT', value: '18,7', unit: 'MMOL_L' },
      90: { action: 'CORRECT', value: '1,05', unit: 'G_L' },
    };
    expect(buildDecisions(report, choices, 'G_L').decisions).toEqual([
      { line: 42, action: 'CORRECT', correctedValue: 18.7, correctedUnit: 'MMOL_L' },
      { line: 90, action: 'CORRECT', correctedValue: 1.05 },
    ]);
  });

  it('correction incomplète : signalée sur sa ligne, pas envoyée, pas comptée en plus… mais comptée à l’écran', () => {
    const choices: Choices = {
      42: { action: 'CORRECT', value: '18,7' },
      149: { action: 'CORRECT' },
      20: { action: 'ACCEPT' },
    };
    expect(buildDecisions(report, choices, 'G_L')).toEqual({
      decisions: [{ line: 20, action: 'ACCEPT' }],
      problems: { 42: 'outOfRange', 149: 'missing' },
    });
    // Le compteur annonce le résultat VOULU (le bouton n'envoie rien tant que les corrections manquent).
    expect(importCount(report, choices)).toBe(142);
  });

  it('une ligne rejetée « acceptée » (choix impossible) n’est ni envoyée ni comptée', () => {
    const choices: Choices = { 149: { action: 'ACCEPT' } };
    expect(buildDecisions(report, choices, 'G_L').decisions).toEqual([]);
    expect(importCount(report, choices)).toBe(139);
  });

  it('une ligne rejetée peut être corrigée', () => {
    const choices: Choices = { 149: { action: 'CORRECT', value: '1,05' } };
    expect(buildDecisions(report, choices, 'G_L').decisions).toEqual([
      { line: 149, action: 'CORRECT', correctedValue: 1.05 },
    ]);
    expect(importCount(report, choices)).toBe(140);
  });
});

describe('affichage par paquets (un fichier abîmé peut compter 5 000 lignes)', () => {
  const rows = Array.from({ length: 75 }, (_, i) => i + 2);

  it(`${ROWS_PAGE} lignes d’abord, puis « Voir … de plus » jusqu’au bout`, () => {
    expect(ROWS_PAGE).toBe(30);
    expect(pageOf(rows, ROWS_PAGE)).toEqual({ visible: rows.slice(0, 30), next: 30 });
    expect(pageOf(rows, 60)).toEqual({ visible: rows.slice(0, 60), next: 15 });
    expect(pageOf(rows, 90)).toEqual({ visible: rows, next: 0 });
    expect(pageOf(rows.slice(0, 5), ROWS_PAGE)).toEqual({ visible: rows.slice(0, 5), next: 0 });
    expect(pageOf([], ROWS_PAGE)).toEqual({ visible: [], next: 0 });
  });
});

describe('import ou annulation ratés', () => {
  const decisions = [
    { line: 42, action: 'CORRECT' as const, correctedValue: 1.87 },
    { line: 149, action: 'CORRECT' as const, correctedValue: 1.1 },
  ];
  const error = (status: number, body?: unknown) => new ApiError(status, 'refus', body);

  it('réseau, déjà fait, aperçu expiré, lot introuvable', () => {
    expect(commitProblem(error(0), decisions)).toEqual({ kind: 'offline' });
    expect(commitProblem(error(409, { code: 'IMPORT_ALREADY_COMMITTED' }), decisions)).toEqual({
      kind: 'done',
    });
    expect(commitProblem(error(409, { message: 'Aperçu expiré' }), decisions)).toEqual({
      kind: 'expired',
    });
    expect(commitProblem(error(404), decisions)).toEqual({ kind: 'notFound' });
  });

  it('refus du serveur sur une décision ⇒ message sur SA ligne (index de la décision ⇒ ligne)', () => {
    const body = {
      message: 'Données invalides',
      issues: [
        { path: 'decisions.1.action', message: 'Date ou heure illisible : corrigez le fichier.' },
      ],
    };
    expect(commitProblem(error(400, body), decisions)).toEqual({
      kind: 'rows',
      byLine: { 149: 'Date ou heure illisible : corrigez le fichier.' },
    });
  });

  it('400 sans décision reconnaissable, panne, réponse inattendue ⇒ erreur générique', () => {
    expect(
      commitProblem(
        error(400, { issues: [{ path: 'decisions', message: 'Une seule décision par ligne' }] }),
        decisions,
      ),
    ).toEqual({ kind: 'error' });
    expect(
      commitProblem(
        error(400, { issues: [{ path: 'decisions.9.line', message: 'x' }] }),
        decisions,
      ),
    ).toEqual({ kind: 'error' });
    expect(commitProblem(error(500), decisions)).toEqual({ kind: 'error' });
    expect(commitProblem(new Error('schéma'), decisions)).toEqual({ kind: 'error' });
  });
});

describe('traductions de L4-07', () => {
  const tFor = async (resources: object, lng: string) => {
    const instance = i18next.createInstance();
    await instance.init({ lng, resources: { [lng]: { translation: resources } } });
    return instance.t.bind(instance);
  };

  it('singulier, pluriel et « aucune » en français', async () => {
    const t = await tFor(fr, 'fr');
    expect(t('import.report.import', { count: 141 })).toBe('Importer 141 mesures');
    expect(t('import.report.import', { count: 1 })).toBe('Importer 1 mesure');
    expect(t('import.done.title', { count: 141 })).toBe('141 mesures importées');
    expect(t('import.done.skipped', { count: 0 })).toBe('Aucune ligne ignorée.');
    expect(t('import.done.skipped', { count: 6 })).toBe('6 lignes ignorées.');
    expect(t('import.done.revertedText', { count: 0 })).toBe('Aucune mesure n’était à retirer.');
    expect(t('import.report.group.DUPLICATE.title', { count: 5 })).toBe('Doublons (5)');
    // Confirmation d'annulation : deux boutons sans ambiguïté.
    expect(t('import.done.revertYes', { count: 141 })).toBe('Retirer les 141 mesures');
    expect(t('import.done.revertYes', { count: 1 })).toBe('Retirer la mesure');
    expect(t('import.done.keep')).toBe('Garder l’import');
  });

  it('mêmes clés en anglais, et un texte pour chaque action, groupe et problème', async () => {
    const t = await tFor(en, 'en');
    expect(t('import.report.import', { count: 141 })).toBe('Import 141 readings');
    for (const dict of [fr, en] as unknown as {
      import: {
        report: { action: object; group: object; problem: object };
        issue: object;
      };
    }[]) {
      expect(Object.keys(dict.import.report.action).sort()).toEqual([
        'ACCEPT',
        'CORRECT',
        'IGNORE',
      ]);
      expect(Object.keys(dict.import.report.group).sort()).toEqual([...REPORT_GROUPS].sort());
      expect(Object.keys(dict.import.report.problem).sort()).toEqual([
        'invalid',
        'missing',
        'outOfRange',
      ]);
      expect(Object.keys(dict.import.issue).sort()).toEqual(
        ['done', 'error', 'expired', 'notFound', 'offline', 'restart'].sort(),
      );
    }
  });
});
