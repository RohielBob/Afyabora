// Tests du ticket L4-05 : choix du fichier et de l'unité (fonctions pures, sans écran).
import {
  GLUCOSE_UNITS,
  IMPORT_MAX_FILE_BYTES,
  isPlausible,
  type ImportReport,
} from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { ApiError } from '@/lib/api-client';
import { buildPreviewForm, type FormLike } from '../api';
import { importFlow } from '../flow';
import {
  IMPORT_PICKER_TYPES,
  UNIT_EXAMPLES,
  checkFile,
  fileSize,
  previewProblem,
  type PickedFile,
} from '../start';

describe('contrôle du fichier avant l’envoi', () => {
  it.each([
    ['mesures.csv', 'csv'],
    ['MESURES.CSV', 'csv'],
    ['export.txt', 'csv'],
    ['export.tsv', 'csv'],
    ['carnet 2026.xlsx', 'xlsx'],
    ['carnet.XLSX ', 'xlsx'],
  ])('« %s » ⇒ %s', (name, kind) => {
    expect(checkFile({ name, size: 2048 })).toEqual({ ok: true, kind });
  });

  it('ancien Excel (.xls) : expliqué à part ; autres types refusés', () => {
    expect(checkFile({ name: 'carnet.xls', size: 2048 })).toEqual({
      ok: false,
      problem: 'oldExcel',
    });
    for (const name of ['photo.jpg', 'notes.pdf', 'mesures', 'mesures.csv.zip', 'archive.xlsm']) {
      expect(checkFile({ name, size: 2048 })).toEqual({ ok: false, problem: 'unsupported' });
    }
  });

  it('vide ⇒ refusé ; plus de 5 Mo ⇒ refusé ; 5 Mo pile ⇒ accepté ; taille inconnue ⇒ le serveur décide', () => {
    expect(checkFile({ name: 'a.csv', size: 0 })).toEqual({ ok: false, problem: 'empty' });
    expect(checkFile({ name: 'a.csv', size: IMPORT_MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      problem: 'tooLarge',
    });
    expect(checkFile({ name: 'a.csv', size: IMPORT_MAX_FILE_BYTES })).toEqual({
      ok: true,
      kind: 'csv',
    });
    expect(checkFile({ name: 'a.xlsx', size: null })).toEqual({ ok: true, kind: 'xlsx' });
  });

  it('le type du fichier passe avant sa taille (un .pdf vide est « non pris en charge »)', () => {
    expect(checkFile({ name: 'a.pdf', size: 0 })).toEqual({ ok: false, problem: 'unsupported' });
    expect(checkFile({ name: 'a.xls', size: IMPORT_MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      problem: 'oldExcel',
    });
  });

  it('sélecteur : CSV et Excel proposés (y compris les types donnés par Android)', () => {
    expect(IMPORT_PICKER_TYPES).toEqual(
      expect.arrayContaining([
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ]),
    );
  });
});

describe('taille lisible', () => {
  it('octets, Ko arrondis, Mo à une décimale (unités de 1 024)', () => {
    expect(fileSize(812)).toEqual({ amount: 812, unit: 'bytes' });
    expect(fileSize(1023)).toEqual({ amount: 1023, unit: 'bytes' });
    expect(fileSize(1024)).toEqual({ amount: 1, unit: 'kb' });
    expect(fileSize(12_800)).toEqual({ amount: 13, unit: 'kb' });
    expect(fileSize(1024 * 1024 - 1)).toEqual({ amount: 1024, unit: 'kb' });
    expect(fileSize(1024 * 1024)).toEqual({ amount: 1, unit: 'mb' });
    expect(fileSize(1.26 * 1024 * 1024)).toEqual({ amount: 1.3, unit: 'mb' });
    expect(fileSize(IMPORT_MAX_FILE_BYTES)).toEqual({ amount: 5, unit: 'mb' });
  });
});

describe('unité des valeurs', () => {
  it('chaque exemple est une valeur plausible dans SON unité (1,10 g/L = 110 mg/dL)', () => {
    for (const unit of GLUCOSE_UNITS) expect(isPlausible(UNIT_EXAMPLES[unit], unit)).toBe(true);
    expect(UNIT_EXAMPLES).toEqual({ G_L: 1.1, MG_DL: 110, MMOL_L: 6.1 });
  });
});

describe('issue d’une analyse ratée', () => {
  const error = (status: number, body?: unknown, message = 'refus') =>
    new ApiError(status, message, body);

  it('réseau, trop gros, trop d’analyses, colonnes à choisir', () => {
    expect(previewProblem(error(0))).toEqual({ kind: 'offline' });
    expect(previewProblem(error(413, {}, 'Fichier trop volumineux (maximum 5 Mo).'))).toEqual({
      kind: 'tooLarge',
      detail: 'Fichier trop volumineux (maximum 5 Mo).',
    });
    expect(previewProblem(error(429))).toEqual({ kind: 'tooMany' });
    expect(
      previewProblem(
        error(400, {
          code: 'IMPORT_COLUMNS_NOT_FOUND',
          issues: [{ path: 'file', message: 'Colonnes introuvables' }],
          columns: ['Quand'],
        }),
      ),
    ).toEqual({ kind: 'columns' });
  });

  it('fichier illisible : le message précis du serveur est gardé', () => {
    const body = {
      message: 'Données invalides',
      issues: [{ path: 'file', message: 'Classeur Excel illisible : le fichier est abîmé' }],
    };
    expect(previewProblem(error(400, body))).toEqual({
      kind: 'unreadable',
      detail: 'Classeur Excel illisible : le fichier est abîmé',
    });
  });

  it('autre refus avec un message (profil à compléter) ; champ invalide ⇒ erreur générique', () => {
    expect(
      previewProblem(error(400, { message: 'Complétez votre profil' }, 'Complétez votre profil')),
    ).toEqual({ kind: 'rejected', detail: 'Complétez votre profil' });
    expect(previewProblem(error(400, { issues: [{ path: 'defaultUnit', message: 'x' }] }))).toEqual(
      { kind: 'error' },
    );
  });

  it('panne du serveur, réponse inattendue ⇒ erreur générique', () => {
    expect(previewProblem(error(500))).toEqual({ kind: 'error' });
    expect(previewProblem(new Error('réponse inattendue'))).toEqual({ kind: 'error' });
    expect(previewProblem(error(404))).toEqual({ kind: 'error' });
  });
});

describe('formulaire envoyé à POST /imports/preview', () => {
  const recorder = () => {
    const parts: unknown[][] = [];
    const form: FormLike & { parts: unknown[][] } = {
      parts,
      append: (...args: unknown[]) => {
        parts.push(args);
      },
    };
    return form;
  };
  const picked: PickedFile = {
    name: 'carnet.csv',
    size: 2048,
    uri: 'file:///cache/carnet.csv',
    mimeType: 'text/csv',
  };

  it('téléphone : unité, puis le fichier désigné par son adresse locale', () => {
    const form = buildPreviewForm(recorder(), picked, 'MMOL_L');
    expect(form.parts).toEqual([
      ['defaultUnit', 'MMOL_L'],
      ['file', { uri: 'file:///cache/carnet.csv', name: 'carnet.csv', type: 'text/csv' }],
    ]);
  });

  it('type inconnu ⇒ « application/octet-stream » (le serveur lit le contenu)', () => {
    const form = buildPreviewForm(recorder(), { ...picked, mimeType: undefined }, 'G_L');
    expect(form.parts[1]?.[1]).toMatchObject({ type: 'application/octet-stream' });
  });

  it('navigateur : le vrai fichier, avec son nom ; correspondance des colonnes en JSON', () => {
    const blob = new Blob(['date;valeur']);
    const form = buildPreviewForm(recorder(), { ...picked, file: blob }, 'G_L', {
      date: 'Quand',
      value: 'Combien',
    });
    expect(form.parts).toEqual([
      ['defaultUnit', 'G_L'],
      ['mapping', '{"date":"Quand","value":"Combien"}'],
      ['file', blob, 'carnet.csv'],
    ]);
  });
});

describe('parcours d’import en mémoire', () => {
  const report: ImportReport = {
    batchId: '3f2b8c1e-6a4d-4e1b-9c7a-1d2e3f4a5b6c',
    analyzed: 1,
    valid: 1,
    duplicates: 0,
    inconsistent: 0,
    errors: 0,
    rows: [],
  };
  const file: PickedFile = { name: 'a.csv', size: 10, uri: 'file:///a.csv' };

  it('démarre avec l’unité préférée, sans fichier ni rapport', () => {
    importFlow.start('MMOL_L');
    expect(importFlow.get()).toEqual({ file: null, unit: 'MMOL_L', report: null });
  });

  it('autre fichier ou autre unité ⇒ l’ancien rapport est oublié ; même unité ⇒ rien ne change', () => {
    importFlow.start('G_L');
    importFlow.chooseFile(file);
    importFlow.analysed(report);
    expect(importFlow.get().report).toBe(report);

    importFlow.chooseUnit('G_L');
    expect(importFlow.get().report).toBe(report);
    importFlow.chooseUnit('MG_DL');
    expect(importFlow.get()).toEqual({ file, unit: 'MG_DL', report: null });

    importFlow.analysed(report);
    importFlow.chooseFile({ ...file, name: 'b.csv' });
    expect(importFlow.get()).toMatchObject({ file: { name: 'b.csv' }, report: null });
  });

  it('prévient les écrans à chaque changement, plus après désabonnement', () => {
    const seen: number[] = [];
    const stop = importFlow.subscribe(() => seen.push(1));
    importFlow.start('G_L');
    importFlow.chooseUnit('G_L'); // aucun changement : personne n'est prévenu
    importFlow.chooseFile(file);
    stop();
    importFlow.chooseFile(null);
    expect(seen).toHaveLength(2);
  });
});

describe('traductions de L4-05', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];

  it('mêmes clés en français et en anglais ; un texte par problème', () => {
    const frImport = (fr as unknown as { import: object }).import;
    const enImport = (en as unknown as { import: object }).import;
    expect(keys(enImport).sort()).toEqual(keys(frImport).sort());
    for (const problem of ['empty', 'tooLarge', 'oldExcel', 'unsupported']) {
      expect(keys(frImport)).toContain(`fileProblem.${problem}`);
    }
    for (const kind of ['offline', 'tooLarge', 'unreadable', 'tooMany', 'rejected', 'error']) {
      expect(keys(frImport)).toContain(`problem.${kind}.title`);
    }
    for (const unit of ['bytes', 'kb', 'mb']) {
      expect(keys(frImport)).toContain(`size.${unit}`);
    }
  });

  it('entrées depuis le Profil et l’Historique vide', () => {
    for (const dict of [fr, en] as unknown as {
      profile: Record<string, string>;
      timeline: { empty: Record<string, string> };
    }[]) {
      expect(dict.profile.import).toBeTruthy();
      expect(dict.profile.importHint).toBeTruthy();
      expect(dict.timeline.empty.import).toBeTruthy();
    }
  });
});
