// Tests du ticket L4-01 : analyseur CSV de l'import (encodages, séparateurs, virgule ou point décimal,
// colonnes, numéros de ligne, limites). Fonctions pures : aucune base, aucun réseau.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS } from '@glyka/shared';
import { describe, expect, it } from 'vitest';
import {
  CsvImportError,
  DELIMITER_SAMPLE_LINES,
  decodeText,
  detectDelimiter,
  detectMapping,
  parseCsv,
  parseDecimal,
  type CsvErrorCode,
} from '../src/modules/imports/csv-parser';

const SAMPLES = join(__dirname, '..', '..', '..', 'scripts', 'sample-data');
const sample = (name: string) => new Uint8Array(readFileSync(join(SAMPLES, name)));
const utf8 = (text: string) => new TextEncoder().encode(text);
/** Encode en Windows-1252 (caractères Latin-1 seulement : suffisant pour les accents français). */
const cp1252 = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));

const errorOf = (run: () => unknown): CsvImportError => {
  try {
    run();
  } catch (error) {
    if (error instanceof CsvImportError) return error;
    throw error;
  }
  throw new Error('aucune erreur levée');
};
const codeOf = (run: () => unknown): CsvErrorCode => errorOf(run).code;

describe('fichiers de démonstration (scripts/sample-data)', () => {
  it('import-demo-147.csv : 147 lignes, séparateur « ; », virgule décimale, lignes du fichier', () => {
    const parsed = parseCsv(sample('import-demo-147.csv'));
    expect(parsed.encoding).toBe('utf-8');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toEqual(['date', 'heure', 'glycemie', 'unite', 'contexte']);
    expect(parsed.mapping).toEqual({ date: 0, time: 1, value: 2, unit: 3, context: 4 });
    expect(parsed.rows).toHaveLength(147);
    expect(parsed.rows[0]).toEqual({
      line: 2,
      date: '18/08/2026',
      time: '07:15',
      rawValue: '0,92',
      value: 0.92,
      unit: 'g/L',
      context: 'à jeun',
      columnMismatch: false,
    });
    expect(parsed.rows.at(-1)?.line).toBe(148);
    // Les 3 valeurs incohérentes du générateur, à leur ligne exacte (ligne 42 = 18,7 g/L).
    const byLine = new Map(parsed.rows.map((r) => [r.line, r]));
    expect(byLine.get(42)?.value).toBe(18.7);
    expect(byLine.get(42)?.rawValue).toBe('18,70');
    expect(byLine.get(90)?.value).toBe(0.02);
    expect(byLine.get(121)?.value).toBe(9.9);
    expect(parsed.rows.every((r) => r.value !== null && !r.columnMismatch)).toBe(true);
  });

  it('import-windows1252.csv : accents lus correctement (ni « Ã© » ni « \uFFFD »)', () => {
    const parsed = parseCsv(sample('import-windows1252.csv'));
    expect(parsed.encoding).toBe('windows-1252');
    expect(parsed.headers).toEqual(['date', 'heure', 'glycémie', 'unité', 'contexte']);
    expect(parsed.mapping).toEqual({ date: 0, time: 1, value: 2, unit: 3, context: 4 });
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.rows[0]?.context).toBe('à jeun');
    expect(parsed.rows[3]?.context).toBe('après repas');
    expect(JSON.stringify(parsed)).not.toMatch(/Ã|\uFFFD/);
  });
});

describe('encodages', () => {
  it('UTF-8 avec BOM : BOM retiré, première colonne bien reconnue', () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('date;valeur\n01/10/2026;1,1\n')]);
    const parsed = parseCsv(bytes);
    expect(parsed.encoding).toBe('utf-8');
    expect(parsed.headers[0]).toBe('date');
    expect(parsed.mapping.date).toBe(0);
  });

  it('un seul octet non UTF-8 ⇒ tout le fichier relu en Windows-1252', () => {
    expect(decodeText(cp1252('Glycémie à jeun'))).toEqual({
      text: 'Glycémie à jeun',
      encoding: 'windows-1252',
    });
    // Plage 0x80–0x9F (le décodeur de Node la lit mal) : apostrophe courbe, œ, €, points de suspension.
    expect(decodeText(Uint8Array.from([0x80, 0x85, 0x92, 0x9c, 0x8c, 0x9f]))).toEqual({
      text: '€…’œŒŸ',
      encoding: 'windows-1252',
    });
    // Octet non attribué ⇒ caractère de remplacement (jamais un caractère de contrôle invisible).
    expect(decodeText(Uint8Array.from([0x81, 0x41])).text).toBe('\uFFFDA');
    expect(decodeText(Uint8Array.from([0x7f, 0xa0, 0xff])).text).toBe('\u007f\u00a0ÿ');
    const parsed = parseCsv(
      Uint8Array.from([
        ...cp1252('date;valeur;contexte\n01/10/2026;1,1;c'),
        0x92,
        ...cp1252('est la f'),
        0x90,
        ...cp1252('te\n'),
      ]),
    );
    expect(parsed.rows[0]?.context).toBe('c’est la f\uFFFDte');
    expect(decodeText(utf8('Glycémie à jeun')).encoding).toBe('utf-8');
  });

  it('UTF-16 avec BOM (export « texte Unicode » d’Excel, tabulations)', () => {
    const text = 'Date\tGlycémie\r\n01/10/2026\t110\r\n';
    const le = Uint8Array.from([0xff, 0xfe, ...new Uint8Array(Buffer.from(text, 'utf16le'))]);
    const be = Uint8Array.from([
      0xfe,
      0xff,
      ...new Uint8Array(Buffer.from(text, 'utf16le').swap16()),
    ]);
    for (const [bytes, encoding] of [
      [le, 'utf-16le'],
      [be, 'utf-16be'],
    ] as const) {
      const parsed = parseCsv(bytes);
      expect(parsed.encoding).toBe(encoding);
      expect(parsed.delimiter).toBe('\t');
      expect(parsed.headers).toEqual(['Date', 'Glycémie']);
      expect(parsed.rows[0]?.value).toBe(110);
    }
  });
});

describe('séparateurs', () => {
  it('« ; », tabulation et « , » (valeur décimale entre guillemets)', () => {
    expect(parseCsv(utf8('date;valeur\n01/10/2026;1,1\n')).delimiter).toBe(';');
    expect(parseCsv(utf8('date\tvaleur\n01/10/2026\t1,1\n')).delimiter).toBe('\t');
    const comma = parseCsv(utf8('date,valeur,unite\n01/10/2026,"1,1",g/L\n02/10/2026,95,mg/dL\n'));
    expect(comma.delimiter).toBe(',');
    expect(comma.rows.map((r) => [r.value, r.unit])).toEqual([
      [1.1, 'g/L'],
      [95, 'mg/dL'],
    ]);
  });

  it('virgules décimales dans un fichier « ; » : « ; » choisi, pas « , »', () => {
    // Avec « , », l'en-tête n'aurait qu'une colonne : ce candidat est écarté.
    expect(detectDelimiter('date;heure;valeur\n01/10/2026;07:00;0,92\n')).toBe(';');
  });

  it('le plus régulier gagne, puis le plus de colonnes, puis l’ordre « ; », tabulation, « , »', () => {
    // « , » : 3 colonnes partout ; « ; » : 2 colonnes dans l'en-tête mais lignes irrégulières.
    expect(detectDelimiter('a;b,c,d\n1,2,3\n4,5,6\n')).toBe(',');
    // Même régularité : « , » (3 colonnes) passe devant « ; » (2 colonnes).
    expect(detectDelimiter('a;b,c,d\n1;2,3,4\n')).toBe(',');
    // Égalité parfaite : « ; » d'abord.
    expect(detectDelimiter('a;b,c\n1;2,3\n')).toBe(';');
    expect(detectDelimiter('a\tb,c\n1\t2,3\n')).toBe('\t');
    expect(detectDelimiter('juste une colonne\n12\n')).toBeNull();
  });

  it(`seules les ${DELIMITER_SAMPLE_LINES} premières lignes servent à choisir`, () => {
    // Sur l'échantillon, « ; » et « , » sont aussi réguliers (égalité ⇒ « ; ») ; au-delà, 50 lignes que
    // seul « , » découpe bien ne changent pas le choix.
    const regular = Array.from({ length: DELIMITER_SAMPLE_LINES - 1 }, () => '1;2,3');
    const text = ['a;b,c', ...regular, ...Array.from({ length: 50 }, () => '1,2')].join('\n');
    expect(detectDelimiter(text)).toBe(';');
  });

  it('« sep=; » d’Excel impose le séparateur et compte comme une ligne', () => {
    const parsed = parseCsv(utf8('sep=,\r\ndate,valeur\r\n01/10/2026,1.1\r\n'));
    expect(parsed.delimiter).toBe(',');
    expect(parsed.headers).toEqual(['date', 'valeur']);
    expect(parsed.rows[0]).toMatchObject({ line: 3, value: 1.1 });
    // Sans l'indication, « ; » gagnerait (égalité) : c'est bien « sep= » qui décide.
    const forced = parseCsv(utf8('sep=,\ndate;heure,valeur\n01/10/2026;07:00,1.1\n'));
    expect(forced.delimiter).toBe(',');
    expect(forced.headers).toEqual(['date;heure', 'valeur']);
  });

  it('une seule colonne : erreur claire « pas un tableau »', () => {
    expect(codeOf(() => parseCsv(utf8('glycemie\n110\n120\n')))).toBe('NOT_TABULAR');
  });
});

describe('numéros de ligne et lignes abîmées', () => {
  it('lignes vides ignorées mais comptées ; CRLF, LF et CR seul', () => {
    for (const nl of ['\n', '\r\n', '\r']) {
      const text = ['date;valeur', '', '01/10/2026;1,1', ' ; ', '02/10/2026;1,2', ''].join(nl);
      expect(parseCsv(utf8(text)).rows.map((r) => [r.line, r.value])).toEqual([
        [3, 1.1],
        [5, 1.2],
      ]);
    }
  });

  it('champ entre guillemets sur deux lignes : la ligne suivante garde son vrai numéro', () => {
    const text = 'date;valeur;contexte\n01/10/2026;1,1;"repas\nde fête"\n02/10/2026;1,2;\n';
    const parsed = parseCsv(utf8(text));
    expect(parsed.rows.map((r) => [r.line, r.context])).toEqual([
      [2, 'repas\nde fête'],
      [4, undefined],
    ]);
  });

  it('ligne avec trop ou pas assez de colonnes : rendue, marquée, sans planter', () => {
    const parsed = parseCsv(
      utf8('date;valeur;unite\n01/10/2026;1,1\n02/10/2026;1,2;g/L;x\n03/10/2026;1,3;g/L\n'),
    );
    expect(parsed.rows.map((r) => [r.line, r.unit, r.columnMismatch])).toEqual([
      [2, undefined, true],
      [3, 'g/L', true],
      [4, 'g/L', false],
    ]);
  });

  it('espaces autour des en-têtes et des cellules retirés', () => {
    const parsed = parseCsv(utf8(' date ; valeur ; unite \n 01/10/2026 ; 1,1 ; g/L \n'));
    expect(parsed.headers).toEqual(['date', 'valeur', 'unite']);
    expect(parsed.rows[0]).toMatchObject({ date: '01/10/2026', rawValue: '1,1', unit: 'g/L' });
  });

  it('valeur illisible ⇒ null, valeur brute gardée pour le rapport', () => {
    const parsed = parseCsv(
      utf8('date;valeur\n01/10/2026;abc\n02/10/2026;\n03/10/2026;"  1,4 "\n'),
    );
    expect(parsed.rows.map((r) => [r.rawValue, r.value])).toEqual([
      ['abc', null],
      ['', null],
      ['1,4', 1.4],
    ]);
  });
});

describe('nombres : virgule ou point décimal', () => {
  it.each([
    ['0,92', 0.92],
    ['0.92', 0.92],
    ['110', 110],
    [' 6,5 ', 6.5],
    ['1 870', 1870],
    ['1\u00a0870', 1870],
    ['1\u202f870,5', 1870.5],
  ])('« %s » ⇒ %s', (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '1,2,3',
    '1.234,5',
    '-5',
    '+5',
    '1,',
    ',5',
    '5 mg/dL',
    'NaN',
    'Infinity',
    '1e3',
  ])('« %s » ⇒ illisible (null)', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });
});

describe('colonnes : détection et correspondance donnée', () => {
  it('en-têtes variés : accents, majuscules, unité entre parenthèses, anglais', () => {
    expect(detectMapping(['Date', 'Heure', 'Glycémie (g/L)', 'Unité', 'Moment'])).toEqual({
      date: 0,
      time: 1,
      value: 2,
      unit: 3,
      context: 4,
    });
    expect(detectMapping(['Timestamp', 'Blood glucose', 'Units', 'Notes'])).toEqual({
      date: 0,
      value: 1,
      unit: 2,
      context: 3,
    });
  });

  it('nom exact avant nom contenant le mot ; une colonne ne sert qu’une fois', () => {
    // « Date et heure » est un nom exact de date : « Heure » reste l'heure.
    expect(detectMapping(['Date et heure', 'Heure', 'Valeur'])).toEqual({
      date: 0,
      time: 1,
      value: 2,
    });
    // « Valeur mesurée » contient « valeur », mais « Valeur » exact passe d'abord.
    expect(detectMapping(['Valeur mesuree', 'Valeur', 'Date'])).toMatchObject({
      value: 1,
      date: 2,
    });
    // Le mot doit être entier : « Update » contient « date » mais n'est pas une date.
    expect(detectMapping(['Update', 'Valeur'])).toEqual({ value: 1 });
    // « Date heure » sert à la date : il n'est pas repris pour l'heure au 2e passage.
    expect(detectMapping(['Date heure', 'Valeur'])).toEqual({ date: 0, value: 1 });
  });

  it('correspondance donnée par le patient : prioritaire, nom exact ou sans accents', () => {
    const text = 'Quand;Combien;Glycémie;Remarque\n01/10/2026;1,1;999;avant sport\n';
    const parsed = parseCsv(utf8(text), { date: 'Quand', value: 'combien', context: 'REMARQUE' });
    expect(parsed.mapping).toEqual({ date: 0, value: 1, context: 3 });
    expect(parsed.rows[0]).toMatchObject({
      date: '01/10/2026',
      value: 1.1,
      context: 'avant sport',
    });
  });

  it('nom exact d’abord : deux colonnes qui ne diffèrent que par les accents', () => {
    const parsed = parseCsv(utf8('date;Glycémie;glycemie\n01/10/2026;1,1;2,2\n'), {
      date: 'date',
      value: 'glycemie',
    });
    expect(parsed.mapping.value).toBe(2);
    expect(parsed.rows[0]?.value).toBe(2.2);
  });

  it('colonne donnée absente ⇒ UNKNOWN_COLUMN avec la liste des colonnes', () => {
    const error = errorOf(() => parseCsv(utf8('a;b\n1;2\n'), { date: 'a', value: 'glycemie' }));
    expect(error.code).toBe('UNKNOWN_COLUMN');
    expect(error.headers).toEqual(['a', 'b']);
    expect(error.message).toContain('glycemie');
  });

  it('date ou valeur introuvable ⇒ MISSING_COLUMNS avec les en-têtes (choix dans l’appli)', () => {
    const error = errorOf(() => parseCsv(utf8('Quand;Combien\n01/10/2026;1,1\n')));
    expect(error.code).toBe('MISSING_COLUMNS');
    expect(error.headers).toEqual(['Quand', 'Combien']);
    expect(codeOf(() => parseCsv(utf8('date;heure\n01/10/2026;07:00\n')))).toBe('MISSING_COLUMNS');
    expect(codeOf(() => parseCsv(utf8('valeur;heure\n1,1;07:00\n')))).toBe('MISSING_COLUMNS');
  });
});

describe('fichier entier : vide et limites', () => {
  it('vide, espaces seuls ou en-tête seul ⇒ EMPTY', () => {
    expect(codeOf(() => parseCsv(new Uint8Array()))).toBe('EMPTY');
    expect(codeOf(() => parseCsv(utf8(' \r\n\n')))).toBe('EMPTY');
    expect(codeOf(() => parseCsv(utf8('date;valeur\n\n')))).toBe('EMPTY');
  });

  it(`plus de ${IMPORT_MAX_FILE_BYTES} octets ⇒ TOO_LARGE ; la limite exacte passe`, () => {
    const head = 'date;valeur\n01/10/2026;1,1\n';
    const exact = utf8(head + ' '.repeat(IMPORT_MAX_FILE_BYTES - head.length));
    expect(exact.length).toBe(IMPORT_MAX_FILE_BYTES);
    expect(parseCsv(exact).rows).toHaveLength(1);
    expect(codeOf(() => parseCsv(new Uint8Array(IMPORT_MAX_FILE_BYTES + 1)))).toBe('TOO_LARGE');
  });

  it(`plus de ${IMPORT_MAX_ROWS} lignes de mesure ⇒ TOO_MANY_ROWS ; la limite exacte passe`, () => {
    const file = (n: number) =>
      utf8(['date;valeur', ...Array.from({ length: n }, () => '01/10/2026;1,1')].join('\n'));
    expect(parseCsv(file(IMPORT_MAX_ROWS)).rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(codeOf(() => parseCsv(file(IMPORT_MAX_ROWS + 1)))).toBe('TOO_MANY_ROWS');
  });
});
