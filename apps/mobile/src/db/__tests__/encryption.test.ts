// Tests du chiffrement de la base locale (L8-02). Le moteur est SIMULÉ, mais il reproduit les comportements
// de SQLCipher 4.7.0 (celui d'expo-sqlite) relevés sur le vrai moteur le 2026-10-19 :
//  - fichier neuf : chiffré avec la clé donnée en premier (ou en clair sans clé) ;
//  - pas de clé, mauvaise clé, ou base en clair ouverte avec une clé ⇒ « file is not a database » ;
//  - sans SQLCipher (Expo Go) : `PRAGMA key` est ignoré, `PRAGMA cipher_version` ne renvoie rien ;
//  - ATTACH … KEY + sqlcipher_export copie tout (le numéro de version est recopié à part).
import {
  EncryptionUnavailableError,
  isNotADatabase,
  keyPragma,
  migrationName,
  openEncryptedDb,
  type CipherDb,
  type CipherDeps,
} from '../encryption';

const KEY = 'a1'.repeat(32);
const OTHER_KEY = 'b2'.repeat(32);
const NAME = 'glyka.db';
const TMP = 'glyka.chiffrement.db';

/** Fichier simulé : `key` = clé de chiffrement, `null` = en clair, `undefined` = fichier vide (jamais écrit). */
interface FakeFile {
  key: string | null | undefined;
  rows: string[];
  version: number;
}

function notADatabase() {
  return new Error('Error code : file is not a database');
}

function setup(options: { cipher?: boolean; require?: boolean } = {}) {
  const cipher = options.cipher ?? true;
  const files = new Map<string, FakeFile>();
  const log: string[] = [];
  const store: { value: string | null; persist: boolean } = { value: null, persist: true };
  let random = KEY;
  let randomCalls = 0;
  let failure: ((sql: string) => Error | undefined) | null = null;
  const openHandles = new Set<object>();

  function open(name: string): CipherDb {
    if (!files.has(name)) files.set(name, { key: undefined, rows: [], version: 0 });
    let sessionKey: string | null = null;
    let attached: { name: string; key: string } | null = null;
    const handle: CipherDb = {
      async exec(sql) {
        log.push(`${name}: ${sql}`);
        const injected = failure?.(sql);
        if (injected) throw injected;
        const key = /^PRAGMA key = "x'([0-9a-f]{64})'"$/.exec(sql);
        if (key) {
          if (cipher) sessionKey = key[1]!;
          return;
        }
        const attach = /^ATTACH DATABASE '(.+)' AS chiffree KEY "x'([0-9a-f]{64})'"$/.exec(sql);
        if (attach) {
          attached = { name: attach[1]!.split('/').pop()!, key: attach[2]! };
          return;
        }
        const version = /^PRAGMA chiffree\.user_version = (\d+)$/.exec(sql);
        if (version) {
          files.get(attached!.name)!.version = Number(version[1]);
          return;
        }
        if (sql === 'DETACH DATABASE chiffree') attached = null;
      },
      async first<T>(sql: string) {
        log.push(`${name}: ${sql}`);
        const injected = failure?.(sql);
        if (injected) throw injected;
        if (sql === 'PRAGMA cipher_version') {
          return (cipher ? { cipher_version: '4.7.0 community' } : null) as T | null;
        }
        const file = files.get(name)!;
        if (file.key === undefined) file.key = sessionKey; // premier accès : le fichier prend la clé (ou rien)
        if (!cipher && file.key !== null) throw notADatabase();
        if (cipher && file.key !== sessionKey) throw notADatabase();
        if (sql === 'PRAGMA user_version') return { user_version: file.version } as T;
        if (sql === "SELECT sqlcipher_export('chiffree')") {
          files.set(attached!.name, { key: attached!.key, rows: [...file.rows], version: 0 });
          return null;
        }
        return { n: file.rows.length } as T;
      },
      async close() {
        openHandles.delete(handle);
      },
    };
    openHandles.add(handle);
    return handle;
  }

  const deps: CipherDeps = {
    open: async (name) => open(name),
    pathOf: (name) => `/data/user/0/com.glyka.app/files/SQLite/${name}`,
    exists: async (name) => files.has(name),
    remove: async (name) => {
      log.push(`remove ${name}`);
      files.delete(name);
    },
    rename: async (from, to) => {
      log.push(`rename ${from} -> ${to}`);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    readKey: async () => store.value,
    saveKey: async (hex) => {
      if (store.persist) store.value = hex;
    },
    randomKey: async () => {
      randomCalls++;
      return random;
    },
    requireEncryption: options.require ?? true,
  };

  return {
    deps,
    files,
    log,
    store,
    openHandles,
    randomCalls: () => randomCalls,
    setRandom: (value: string) => (random = value),
    failWhen: (fn: (sql: string) => Error | undefined) => (failure = fn),
  };
}

describe('openEncryptedDb', () => {
  it('premier lancement : clé aléatoire créée et gardée, base neuve chiffrée avec elle', async () => {
    const t = setup();
    const opened = await openEncryptedDb(NAME, t.deps);

    expect(opened).toMatchObject({ state: 'encrypted', recovery: 'none' });
    expect(t.store.value).toBe(KEY);
    expect(t.files.get(NAME)!.key).toBe(KEY);
    // La clé est TOUJOURS la première instruction envoyée à la base.
    expect(t.log[0]).toBe(`${NAME}: PRAGMA key = "x'${KEY}'"`);
  });

  it('lancements suivants : la même clé est reprise (pas de nouvelle clé), les données restent lisibles', async () => {
    const t = setup();
    await openEncryptedDb(NAME, t.deps);
    t.files.get(NAME)!.rows.push('mesure');
    t.setRandom(OTHER_KEY);

    const again = await openEncryptedDb(NAME, t.deps);
    expect(again).toMatchObject({ state: 'encrypted', recovery: 'none' });
    expect(t.randomCalls()).toBe(1);
    expect(await again.db.first<{ n: number }>('SELECT count(*) AS n FROM sqlite_master')).toEqual({
      n: 1,
    });
  });

  it('ancienne base EN CLAIR : convertie en base chiffrée, données et version gardées, aucune copie laissée', async () => {
    const t = setup();
    t.files.set(NAME, { key: null, rows: ['m1', 'm2', 'e1'], version: 2 });

    const opened = await openEncryptedDb(NAME, t.deps);

    expect(opened).toMatchObject({ state: 'encrypted', recovery: 'migrated' });
    expect(t.files.get(NAME)).toEqual({ key: KEY, rows: ['m1', 'm2', 'e1'], version: 2 });
    expect(t.files.has(TMP)).toBe(false);
    // Copie vers le chemin COMPLET du fichier temporaire, chiffrée avec la clé du coffre.
    expect(t.log).toContain(
      `${NAME}: ATTACH DATABASE '/data/user/0/com.glyka.app/files/SQLite/${TMP}' AS chiffree KEY "x'${KEY}'"`,
    );
    // Le journal WAL est reversé avant la copie, l'originale n'est supprimée qu'APRÈS la copie complète.
    const order = (entry: string) => {
      const at = t.log.findIndex((l) => l.includes(entry));
      expect(at).toBeGreaterThanOrEqual(0); // l'étape doit exister (sinon -1 passerait pour « avant »)
      return at;
    };
    expect(order('wal_checkpoint')).toBeLessThan(order('sqlcipher_export'));
    expect(order('sqlcipher_export')).toBeLessThan(order(`remove ${NAME}`));
    expect(order(`remove ${NAME}`)).toBeLessThan(order(`rename ${TMP}`));
  });

  it('clé perdue (base chiffrée avec une autre clé, coffre vide) : base illisible recréée vide', async () => {
    const t = setup();
    t.files.set(NAME, { key: OTHER_KEY, rows: ['m1'], version: 2 });

    const opened = await openEncryptedDb(NAME, t.deps);

    expect(opened).toMatchObject({ state: 'encrypted', recovery: 'reset' });
    expect(t.files.get(NAME)).toEqual({ key: KEY, rows: [], version: 0 });
  });

  it('autre panne (disque…) : erreur remontée, la base n’est JAMAIS effacée', async () => {
    const t = setup();
    t.files.set(NAME, { key: KEY, rows: ['m1'], version: 2 });
    t.store.value = KEY;
    // Panne UNIQUE, sur la première lecture : sans le contrôle, on irait tester « base en clair ? », qui
    // répondrait « illisible »… et la base serait effacée.
    let calls = 0;
    t.failWhen((sql) =>
      sql.startsWith('SELECT count') && ++calls === 1 ? new Error('disk I/O error') : undefined,
    );

    await expect(openEncryptedDb(NAME, t.deps)).rejects.toThrow('disk I/O error');
    expect(t.files.get(NAME)!.rows).toEqual(['m1']);
    expect(t.log.some((l) => l.startsWith('remove'))).toBe(false);
  });

  it('autre panne pendant le test « base en clair ? » : remontée aussi, rien d’effacé', async () => {
    const t = setup();
    t.files.set(NAME, { key: OTHER_KEY, rows: ['m1'], version: 2 });
    let calls = 0;
    t.failWhen((sql) =>
      sql.startsWith('SELECT count') && ++calls === 2 ? new Error('disk I/O error') : undefined,
    );

    await expect(openEncryptedDb(NAME, t.deps)).rejects.toThrow('disk I/O error');
    expect(t.files.get(NAME)!.rows).toEqual(['m1']);
  });

  it('APK sans SQLCipher alors qu’il est exigé : refus (rien en clair), base refermée', async () => {
    const t = setup({ cipher: false, require: true });
    await expect(openEncryptedDb(NAME, t.deps)).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect(t.openHandles.size).toBe(0);
  });

  it('développement (Expo Go, sans SQLCipher, non exigé) : base en clair, état « unencrypted »', async () => {
    const t = setup({ cipher: false, require: false });
    const opened = await openEncryptedDb(NAME, t.deps);
    expect(opened).toMatchObject({ state: 'unencrypted', recovery: 'none' });
  });

  it('conversion interrompue APRÈS la suppression de l’originale : la copie chiffrée devient la base', async () => {
    const t = setup();
    t.store.value = KEY;
    t.files.set(TMP, { key: KEY, rows: ['m1'], version: 2 });

    const opened = await openEncryptedDb(NAME, t.deps);
    expect(opened).toMatchObject({ state: 'encrypted', recovery: 'none' });
    expect(t.files.get(NAME)).toEqual({ key: KEY, rows: ['m1'], version: 2 });
    expect(t.files.has(TMP)).toBe(false);
  });

  it('conversion interrompue AVANT la suppression : copie partielle jetée, conversion refaite', async () => {
    const t = setup();
    t.store.value = KEY;
    t.files.set(NAME, { key: null, rows: ['m1', 'm2'], version: 2 });
    t.files.set(TMP, { key: KEY, rows: ['m1'], version: 0 }); // incomplète

    const opened = await openEncryptedDb(NAME, t.deps);
    expect(opened).toMatchObject({ state: 'encrypted', recovery: 'migrated' });
    expect(t.files.get(NAME)).toEqual({ key: KEY, rows: ['m1', 'm2'], version: 2 });
    expect(t.files.has(TMP)).toBe(false);
  });

  it('clé non gardée par le coffre : erreur AVANT de créer la base (sinon illisible au lancement suivant)', async () => {
    const t = setup();
    t.store.persist = false;
    await expect(openEncryptedDb(NAME, t.deps)).rejects.toThrow(
      'Clé de la base locale non enregistrée',
    );
    expect(t.files.has(NAME)).toBe(false);
  });

  it('clé du coffre abîmée : remplacée ; clé aléatoire invalide : refus', async () => {
    const t = setup();
    t.store.value = 'pas-une-cle';
    await openEncryptedDb(NAME, t.deps);
    expect(t.store.value).toBe(KEY);

    const u = setup();
    u.setRandom('1234');
    await expect(openEncryptedDb(NAME, u.deps)).rejects.toThrow('Clé aléatoire invalide');
    expect(u.files.has(NAME)).toBe(false);
  });
});

describe('outils', () => {
  it('keyPragma : clé brute de 32 octets ; refuse tout autre texte (pas d’injection SQL)', () => {
    expect(keyPragma(KEY)).toBe(`PRAGMA key = "x'${KEY}'"`);
    expect(() => keyPragma(`${KEY.slice(2)}'"`)).toThrow();
    expect(() => keyPragma(KEY.toUpperCase())).toThrow();
    expect(() => keyPragma(KEY.slice(1))).toThrow();
  });

  it('migrationName et isNotADatabase', () => {
    expect(migrationName('glyka.db')).toBe('glyka.chiffrement.db');
    expect(
      isNotADatabase(new Error('Call to function … has been rejected. file is not a database')),
    ).toBe(true);
    expect(isNotADatabase(new Error('disk I/O error'))).toBe(false);
    expect(isNotADatabase('file is not a database')).toBe(false);
  });

  it('chemin avec une apostrophe : échappé dans ATTACH', async () => {
    const t = setup();
    t.files.set(NAME, { key: null, rows: [], version: 1 });
    const base = t.deps.pathOf;
    t.deps.pathOf = (name) => base(name).replace('/data/', "/d'ata/");
    await openEncryptedDb(NAME, t.deps);
    expect(t.log.some((l) => l.includes("ATTACH DATABASE '/d''ata/"))).toBe(true);
  });
});
