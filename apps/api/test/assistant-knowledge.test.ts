// Ticket L9-02 : fiches de connaissances de l'assistant « Afyabora » (format, règles de contenu, relecture).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KNOWLEDGE_DIR, loadSheets } from '../src/modules/assistant/knowledge/knowledge-sheets';
import {
  contentProblems,
  parseSheet,
  SheetFormatError,
  SHEET_BODY_MAX,
  sheetDigest,
} from '../src/modules/assistant/knowledge/sheet-format';

const BODY = [
  '## Première partie',
  '',
  'Un texte simple et assez long pour être utile au patient. '.repeat(10).trim(),
  '',
  '## Seconde partie',
  '',
  '- un point de liste ;',
  '- un autre point, à voir avec votre médecin.',
].join('\n');

const SOURCE = 'Organisation mondiale de la santé : Diabète | https://www.who.int/fr';

/** Une fiche de test ; `over` remplace des champs de l'en-tête (null = champ retiré). */
function sheetText(over: Record<string, string | null> = {}, body = BODY, sources = [SOURCE]) {
  const fields: Record<string, string | null> = {
    id: 'exemple',
    titre: 'Une fiche d’exemple',
    resume: 'Un résumé court.',
    statut: 'brouillon',
    version: '1',
    relu_par: '',
    relu_le: '',
    empreinte: '',
    mots_cles: 'un, deux, trois, quatre, cinq',
    ...over,
  };
  const head = Object.entries(fields)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => (v === '' ? `${k}:` : `${k}: ${v}`));
  return ['---', ...head, 'sources:', ...sources.map((s) => `  - ${s}`), '---', '', body, ''].join(
    '\n',
  );
}

/** Problèmes signalés pour une fiche (liste vide si elle est acceptée). */
function problemsOf(text: string, file = 'exemple.md'): string[] {
  try {
    parseSheet(text, file);
    return [];
  } catch (error) {
    if (error instanceof SheetFormatError) return error.problems;
    throw error;
  }
}

/** Empreinte de la fiche d'exemple, comme le médecin la recopierait à la validation. */
const DIGEST = sheetDigest({
  title: 'Une fiche d’exemple',
  summary: 'Un résumé court.',
  sources: [
    { label: 'Organisation mondiale de la santé : Diabète', url: 'https://www.who.int/fr' },
  ],
  body: BODY,
});
const VALIDATED = {
  statut: 'validee',
  relu_par: 'Dr Demo',
  relu_le: '2026-10-20',
  empreinte: DIGEST,
};

describe('parseSheet : une fiche bien écrite', () => {
  it('donne les données du contrat (KnowledgeSheet), les mots-clés et l’empreinte', () => {
    const parsed = parseSheet(sheetText(), 'exemple.md');
    expect(parsed.sheet).toEqual({
      id: 'exemple',
      title: 'Une fiche d’exemple',
      summary: 'Un résumé court.',
      status: 'DRAFT',
      version: 1,
      reviewedOn: null,
      reviewedBy: null,
      body: BODY,
      sources: [
        { label: 'Organisation mondiale de la santé : Diabète', url: 'https://www.who.int/fr' },
      ],
    });
    expect(parsed.keywords).toEqual(['un', 'deux', 'trois', 'quatre', 'cinq']);
    expect(parsed.digest).toBe(DIGEST);
  });

  it('accepte une fiche validée avec relecteur, date et empreinte du contenu relu', () => {
    const parsed = parseSheet(sheetText(VALIDATED), 'exemple.md');
    expect(parsed.sheet).toMatchObject({
      status: 'VALIDATED',
      reviewedBy: 'Dr Demo',
      reviewedOn: '2026-10-20',
    });
  });

  it('lit de la même façon une fiche enregistrée sous Windows (fins de ligne CRLF, BOM)', () => {
    const windows = '\uFEFF' + sheetText(VALIDATED).replace(/\n/g, '\r\n');
    expect(parseSheet(windows, 'exemple.md').digest).toBe(DIGEST);
  });

  it('les mots-clés sont mis en minuscules', () => {
    const parsed = parseSheet(sheetText({ mots_cles: 'HbA1c, Glycémie, A, B, C' }), 'exemple.md');
    expect(parsed.keywords).toEqual(['hba1c', 'glycémie', 'a', 'b', 'c']);
  });
});

describe('parseSheet : en-tête et relecture', () => {
  it('refuse une fiche sans en-tête', () => {
    expect(problemsOf(BODY)[0]).toMatch(/en-tête absent/);
  });

  it('exige que l’identifiant soit le nom du fichier', () => {
    expect(problemsOf(sheetText(), 'autre.md')).toContain(
      "l'identifiant « exemple » doit être le nom du fichier sans « .md »",
    );
  });

  it('refuse un champ manquant, inconnu ou en double', () => {
    expect(problemsOf(sheetText({ empreinte: null }))).toContain('champ manquant : « empreinte »');
    expect(problemsOf(sheetText({ auteur: 'moi' }))).toContain('champ inconnu : « auteur »');
    const twice = sheetText().replace('version: 1', 'version: 1\nversion: 2');
    expect(problemsOf(twice)).toContain('champ en double : « version »');
  });

  it('refuse un statut ou une version invalides', () => {
    expect(problemsOf(sheetText({ statut: 'validée' }))).toContain(
      '« statut » : « brouillon » ou « validee »',
    );
    for (const version of ['0', '1.5', 'v1', '']) {
      expect(problemsOf(sheetText({ version }))).toContain(
        '« version » : un nombre entier à partir de 1',
      );
    }
  });

  it('un brouillon ne porte aucune trace de relecture', () => {
    const problem = 'un brouillon laisse « relu_par », « relu_le » et « empreinte » vides';
    expect(problemsOf(sheetText({ relu_par: 'Dr Demo' }))).toContain(problem);
    expect(problemsOf(sheetText({ relu_le: '2026-10-20' }))).toContain(problem);
    expect(problemsOf(sheetText({ empreinte: DIGEST }))).toContain(problem);
  });

  it('une fiche validée indique le médecin relecteur et la date', () => {
    const problem =
      'une fiche validée indique « relu_par » (le médecin) et « relu_le » (AAAA-MM-JJ)';
    expect(problemsOf(sheetText({ ...VALIDATED, relu_par: '' }))).toContain(problem);
    expect(problemsOf(sheetText({ ...VALIDATED, relu_le: '' }))).toContain(problem);
    expect(problemsOf(sheetText({ ...VALIDATED, relu_le: '20/10/2026' })).join()).toMatch(
      /reviewedOn/,
    );
  });

  it('validation : sans empreinte, le message donne celle à recopier (procédure du README)', () => {
    const problems = problemsOf(sheetText({ ...VALIDATED, empreinte: '' }));
    expect(problems).toEqual([
      `empreinte à recopier après la relecture : « empreinte: ${DIGEST} » (empreinte actuelle : « ${DIGEST} »)`,
    ]);
  });

  it('une fiche validée puis modifiée est refusée tant qu’elle n’est pas relue de nouveau', () => {
    const changedBody = BODY.replace('un autre point', 'un point modifié');
    const problems = problemsOf(sheetText(VALIDATED, changedBody));
    expect(problems.join()).toMatch(/le contenu a changé depuis la relecture/);
    // Le message donne l'empreinte actuelle, à recopier après la nouvelle relecture.
    expect(problems.join()).toContain(
      sheetDigest({
        title: 'Une fiche d’exemple',
        summary: 'Un résumé court.',
        sources: [
          { label: 'Organisation mondiale de la santé : Diabète', url: 'https://www.who.int/fr' },
        ],
        body: changedBody,
      }),
    );
  });

  it('l’empreinte couvre le titre, le résumé et les sources, pas les mots-clés', () => {
    expect(problemsOf(sheetText({ ...VALIDATED, titre: 'Autre titre' })).join()).toMatch(
      /contenu a changé/,
    );
    expect(problemsOf(sheetText({ ...VALIDATED, resume: 'Autre résumé.' })).join()).toMatch(
      /contenu a changé/,
    );
    const otherSource = 'OMS : Diabète | https://www.who.int/fr/autre';
    expect(problemsOf(sheetText(VALIDATED, BODY, [otherSource])).join()).toMatch(
      /contenu a changé/,
    );
    expect(problemsOf(sheetText({ ...VALIDATED, mots_cles: 'a, b, c, d, e, f' }))).toEqual([]);
  });

  it('exige au moins une source « Libellé | https://… » et cinq mots-clés', () => {
    expect(problemsOf(sheetText({}, BODY, []))).toContain('au moins une source publique');
    expect(problemsOf(sheetText({}, BODY, ['OMS https://www.who.int']))).toContain(
      'source sans « | » : « OMS https://www.who.int »',
    );
    expect(problemsOf(sheetText({}, BODY, ['OMS | http://www.who.int']))).toContain(
      'source sans adresse https : « OMS | http://www.who.int »',
    );
    expect(problemsOf(sheetText({ mots_cles: 'un, deux, , trois' }))).toContain(
      '« mots_cles » : au moins 5 mots-clés séparés par des virgules',
    );
  });

  it('signale TOUS les problèmes en une fois', () => {
    const problems = problemsOf(
      sheetText({ statut: 'x', version: '0', mots_cles: 'a' }, 'trop court'),
    );
    expect(problems.length).toBeGreaterThanOrEqual(5);
  });
});

describe('contentProblems : ce qu’une fiche ne doit jamais contenir', () => {
  const withSentence = (sentence: string) => `${BODY}\n\n${sentence}`;

  it('le texte d’exemple est accepté', () => {
    expect(contentProblems(BODY)).toEqual([]);
  });

  it.each([
    ['nom commercial de médicament', 'Le Lantus se garde au frais.'],
    ['nom commercial de médicament', 'Parlez de l’OZEMPIC avec lui.'],
    ['dose de médicament', 'Prenez 4 unités de plus.'],
    ['dose de médicament', 'Une injection de 10 UI.'],
    ['dose de médicament', 'Un comprimé de 500 mg le matin.'],
    ['dose de médicament', 'La posologie est indiquée.'],
    ['consigne de modifier un traitement', 'Augmentez votre insuline le soir.'],
    ['consigne de modifier un traitement', 'Il peut doubler la dose.'],
    ['consigne de modifier un traitement', 'Sautez votre traitement ce jour-là.'],
    ['consigne de modifier un traitement', 'Arrêtez le médicament.'],
    ['numéro de téléphone', 'Appelez le 15 tout de suite.'],
    ['numéro de téléphone', 'Composez +243 81 000 0000.'],
    ['promesse de guérison', 'Ce régime permet de guérir le diabète.'],
    ['promesse de guérison', 'Un remède naturel efficace.'],
    ['diagnostic affirmé', 'Vous avez une apnée du sommeil.'],
    ['diagnostic affirmé', 'Vous souffrez de dépression.'],
  ])('refuse : %s (« %s »)', (rule, sentence) => {
    expect(contentProblems(withSentence(sentence)).join()).toContain(`interdit : ${rule}`);
  });

  it.each([
    'Sous 70 mg/dL, on parle d’hypoglycémie.',
    'Prenez environ 15 g de sucre rapide, puis mesurez 15 minutes plus tard.',
    'Un petit verre (15 cl) de jus de fruit.',
    'Arrêtez-vous et demandez de l’aide.',
    'Appelez le numéro d’urgence de votre profil.',
    'Une plaie qui ne guérit pas doit être montrée.',
    'Afyabora ne pose pas de diagnostic.',
    'Ne changez rien à votre traitement sans l’avis de votre médecin.',
  ])('accepte une phrase utile : « %s »', (sentence) => {
    expect(contentProblems(withSentence(sentence))).toEqual([]);
  });

  it('n’accepte que le Markdown simple que le téléphone sait afficher', () => {
    for (const line of [
      '# Titre',
      '### Sous-titre',
      '| a | b |',
      '> citation',
      '<b>gras</b>',
      '```',
      '![image](x.png)',
      '1. premier',
      '* point',
    ]) {
      expect(contentProblems(withSentence(line))).not.toEqual([]);
    }
    expect(contentProblems(withSentence('- un point **important**'))).toEqual([]);
  });

  it('aucun lien dans le texte : les adresses vont dans « sources »', () => {
    for (const sentence of [
      'Voir https://www.who.int.',
      'Voir www.who.int.',
      'Voir [la fiche](x).',
    ]) {
      expect(contentProblems(withSentence(sentence))).toContain(
        'aucun lien dans le texte : les adresses vont dans « sources »',
      );
    }
  });

  it('exige au moins deux parties, une taille raisonnable et le renvoi au médecin', () => {
    expect(contentProblems(BODY.replace('## Seconde partie', 'Seconde partie'))).toContain(
      'au moins deux parties « ## »',
    );
    expect(contentProblems('## A\n\n## B\n\nCourt, voir le médecin.').join()).toMatch(/caractères/);
    expect(contentProblems(BODY + 'x'.repeat(SHEET_BODY_MAX)).join()).toMatch(/caractères/);
    expect(contentProblems(BODY.replace('votre médecin', 'quelqu’un'))).toContain(
      'rappel absent : la fiche doit renvoyer au médecin ou au professionnel de santé',
    );
  });
});

describe('loadSheets', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('lit les fichiers .md par ordre alphabétique et ignore les autres', () => {
    dir = mkdtempSync(join(tmpdir(), 'fiches-'));
    writeFileSync(join(dir, 'b.md'), sheetText({ id: 'b' }));
    writeFileSync(join(dir, 'a.md'), sheetText({ id: 'a' }));
    writeFileSync(join(dir, 'notes.txt'), 'pas une fiche');
    expect(loadSheets(dir).map((s) => s.sheet.id)).toEqual(['a', 'b']);
  });

  it('une seule fiche fautive bloque tout le chargement', () => {
    dir = mkdtempSync(join(tmpdir(), 'fiches-'));
    writeFileSync(join(dir, 'a.md'), sheetText({ id: 'a' }));
    writeFileSync(join(dir, 'b.md'), sheetText({ id: 'b', statut: 'peut-etre' }));
    expect(() => loadSheets(dir!)).toThrow(SheetFormatError);
  });
});

describe('les fiches du dépôt (apps/api/knowledge/fiches)', () => {
  const sheets = loadSheets(KNOWLEDGE_DIR);

  it('les dix sujets validés par le lead technique sont présents (et seulement eux)', () => {
    expect(sheets.map((s) => s.sheet.id)).toEqual([
      'activite-physique',
      'alimentation',
      'hba1c',
      'hyperglycemie',
      'hypoglycemie',
      'lire-ses-glycemies',
      'preparer-une-consultation',
      'quand-demander-de-l-aide',
      'sommeil',
      'stress',
    ]);
  });

  it('chaque fiche cite uniquement des sources officielles reconnues', () => {
    const allowed = [
      'www.federationdesdiabetiques.org',
      'www.has-sante.fr',
      'www.who.int',
      'diabetes.org',
      'doi.org',
    ];
    for (const { sheet } of sheets) {
      for (const source of sheet.sources) {
        expect(allowed, `${sheet.id} : ${source.url}`).toContain(new URL(source.url).hostname);
      }
    }
  });

  it('les seuils cités sont ceux d’Afyabora par défaut (54, 70, 180 et 250 mg/dL)', () => {
    const text = sheets.map((s) => s.sheet.body).join('\n');
    const mgdl = [...text.matchAll(/(\d+) mg\/dL/g)].map((m) => Number(m[1]));
    expect(new Set(mgdl)).toEqual(new Set([54, 70, 100, 180, 250]));
  });

  it('la fiche « quand demander de l’aide » renvoie au numéro d’urgence du profil, jamais à un numéro', () => {
    const help = sheets.find((s) => s.sheet.id === 'quand-demander-de-l-aide')!.sheet.body;
    expect(help).toMatch(/numéro d'urgence enregistré dans votre profil/);
    expect(help).not.toMatch(/\b(?:112|15|911|999)\b/);
  });

  it('les mots-clés d’une fiche sont uniques et ne se répètent pas d’une fiche à l’autre en entier', () => {
    for (const { sheet, keywords } of sheets) {
      expect(new Set(keywords).size, sheet.id).toBe(keywords.length);
    }
    const sets = sheets.map((s) => s.keywords.join('|'));
    expect(new Set(sets).size).toBe(sets.length);
  });
});
