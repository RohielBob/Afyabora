// Règles du pluriel pour les téléphones Android (Hermes n'a pas `Intl.PluralRules`) : voir intl-polyfill.ts.
// Le dernier groupe de tests SIMULE le téléphone : on retire `Intl.PluralRules`, comme sur Hermes, et on
// vérifie qu'aucun texte au pluriel n'affiche son nom technique (« dashboard.chart.period »).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import i18next from 'i18next';
import en from '../en.json';
import es from '../es.json';
import fr from '../fr.json';
import { CARDINAL_RULES, PluralRules, installPluralRules } from '../intl-polyfill';
import kg from '../kg.json';
import ln from '../ln.json';
import lua from '../lua.json';
import pt from '../pt.json';
import sw from '../sw.json';

const select = (locale: string, n: number) => new PluralRules(locale).select(n);

describe('règles du pluriel (CLDR)', () => {
  it('français et lingala : « one » pour 0 et 1', () => {
    for (const locale of ['fr', 'ln']) {
      expect(select(locale, 0)).toBe('one');
      expect(select(locale, 1)).toBe('one');
      expect(select(locale, 2)).toBe('other');
    }
    expect(select('fr', 1.5)).toBe('one'); // 1,5 mesure par jour (partie entière 1)
  });

  it('anglais, swahili, kikongo, tshiluba : « one » pour 1 seulement', () => {
    for (const locale of ['en', 'sw', 'kg', 'lua']) {
      expect(select(locale, 1)).toBe('one');
      expect(select(locale, 0)).toBe('other');
      expect(select(locale, 21)).toBe('other');
    }
    expect(select('en', 1.5)).toBe('other');
  });

  it('français, espagnol, portugais : « many » pour les millions', () => {
    for (const locale of ['fr', 'es', 'pt']) {
      expect(select(locale, 1_000_000)).toBe('many');
      expect(select(locale, 2_000_000)).toBe('many');
      expect(select(locale, 1_000_001)).toBe('other');
    }
    expect(select('es', 1)).toBe('one');
    expect(select('pt', 1)).toBe('one');
    expect(select('pt', 0)).toBe('other');
  });

  it('code avec région, langue inconnue, ordinal, nombre invalide', () => {
    expect(select('pt-PT', 1)).toBe('one');
    expect(select('sw_CD', 1)).toBe('one');
    expect(new PluralRules('de').resolvedOptions().locale).toBe('fr'); // inconnue : règles du français
    expect(new PluralRules('en', { type: 'ordinal' }).select(1)).toBe('other');
    expect(select('en', Number.NaN)).toBe('other');
  });

  it('resolvedOptions : les catégories de la langue (utilisées par i18next)', () => {
    expect(new PluralRules('fr').resolvedOptions().pluralCategories).toEqual([
      'one',
      'many',
      'other',
    ]);
    expect(new PluralRules('ln').resolvedOptions().pluralCategories).toEqual(['one', 'other']);
    expect(PluralRules.supportedLocalesOf(['fr-FR', 'de', 'lua'])).toEqual(['fr-FR', 'lua']);
  });

  it('toutes les langues de l’application ont leurs règles', () => {
    expect(Object.keys(CARDINAL_RULES).sort()).toEqual(
      ['en', 'es', 'fr', 'kg', 'ln', 'lua', 'pt', 'sw'].sort(),
    );
  });
});

describe('installation', () => {
  it('moteur sans Intl.PluralRules (téléphone Android) : installée', () => {
    const target: { Intl?: { PluralRules?: unknown } } = { Intl: {} };
    expect(installPluralRules(target)).toBe(true);
    expect(target.Intl?.PluralRules).toBe(PluralRules);
  });

  it('moteur qui l’a déjà (navigateur, Jest) : rien n’est remplacé', () => {
    const existing = function PluralRulesNative() {};
    const target = { Intl: { PluralRules: existing } };
    expect(installPluralRules(target)).toBe(false);
    expect(target.Intl.PluralRules).toBe(existing);
  });

  it('moteur sans Intl du tout : créé', () => {
    const target: { Intl?: { PluralRules?: unknown } } = {};
    expect(installPluralRules(target)).toBe(true);
    expect(target.Intl?.PluralRules).toBe(PluralRules);
  });
});

// ---------- Simulation du téléphone : Intl.PluralRules absent ----------

const FILES = { fr, en, es, pt, ln, sw, kg, lua } as const;
type Dict = Record<string, unknown>;
const flat = (node: unknown, prefix = ''): string[] =>
  typeof node === 'string'
    ? [prefix]
    : Object.entries(node as Dict).flatMap(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k));
const pluralKeys = [
  ...new Set(
    flat(fr)
      .filter((key) => /_(one|other)$/.test(key))
      .map((key) => key.replace(/_(one|other)$/, '')),
  ),
];

describe('téléphone simulé (sans Intl.PluralRules)', () => {
  const native = Intl.PluralRules;

  beforeEach(() => {
    // Comme Hermes : la fonction n'existe pas. Puis on installe la nôtre.
    delete (Intl as { PluralRules?: unknown }).PluralRules;
    installPluralRules();
  });
  afterEach(() => {
    Object.defineProperty(Intl, 'PluralRules', {
      value: native,
      writable: true,
      configurable: true,
    });
  });

  it.each(Object.keys(FILES))(
    '« %s » : aucun texte au pluriel n’affiche son nom technique',
    async (code) => {
      expect(Intl.PluralRules).toBe(PluralRules);
      const instance = i18next.createInstance();
      await instance.init({
        lng: code,
        fallbackLng: false,
        resources: { [code]: { translation: FILES[code as keyof typeof FILES] } },
      });
      const broken: string[] = [];
      for (const key of pluralKeys) {
        for (const count of [0, 1, 2, 5, 7, 30, 1_000_000]) {
          const text = instance.t(key, { count, days: 7, total: 3, min: 10 });
          if (text === key || !text.trim()) broken.push(`${key} (${count})`);
        }
      }
      expect(broken).toEqual([]);
      // Les deux cas vus sur le téléphone.
      expect(instance.t('dashboard.chart.period', { count: 7 })).not.toBe('dashboard.chart.period');
      expect(instance.t('insights.insufficient.body', { count: 3, days: 30 })).not.toBe(
        'insights.insufficient.body',
      );
    },
  );

  it('au chargement du fichier (comme dans l’app), la règle s’installe toute seule', () => {
    delete (Intl as { PluralRules?: unknown }).PluralRules;
    jest.isolateModules(() => {
      jest.requireActual('../intl-polyfill'); // chargement neuf, comme au démarrage de l'app
    });
    expect(typeof Intl.PluralRules).toBe('function');
    expect(new Intl.PluralRules('fr').select(0)).toBe('one');
  });

  it('sans notre règle, le bug réapparaît (le test sait le voir)', async () => {
    delete (Intl as { PluralRules?: unknown }).PluralRules;
    const instance = i18next.createInstance();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await instance.init({ lng: 'fr', fallbackLng: false, resources: { fr: { translation: fr } } });
    expect(instance.t('dashboard.chart.period', { count: 7 })).toBe('dashboard.chart.period');
    error.mockRestore();
    warn.mockRestore();
  });
});

describe('ordre de chargement', () => {
  it('src/i18n/index.ts importe la règle AVANT i18next (sinon i18next démarre sans elle)', () => {
    const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    const imports = [...source.matchAll(/^import .*from '([^']+)';|^import '([^']+)';/gm)].map(
      (m) => m[1] ?? m[2],
    );
    expect(imports[0]).toBe('./intl-polyfill');
    expect(imports.indexOf('./intl-polyfill')).toBeLessThan(imports.indexOf('i18next'));
  });
});
