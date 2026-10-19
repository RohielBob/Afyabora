// Chiffrement de la base locale (L8-02, ADR-0004) : toutes les données de santé du téléphone (glyka.db) sont
// chiffrées par SQLCipher (AES-256), avec une clé ALÉATOIRE de 32 octets gardée dans le coffre du système
// (SecureStore : Keystore Android, trousseau iOS). La personne n'a rien à retenir ni à saisir.
//
// Cette logique ne dépend ni d'expo-sqlite ni du téléphone (tout passe par `CipherDeps`) : elle est testée en
// entier (__tests__/encryption.test.ts). Comportements de SQLCipher 4.7.0 (celui d'expo-sqlite), vérifiés sur
// le vrai moteur le 2026-10-19 :
//  - `PRAGMA key = "x'<64 hex>'"` : clé brute de 32 octets (pas de dérivation lente) ; à envoyer EN PREMIER ;
//  - `PRAGMA cipher_version` : une ligne avec SQLCipher, aucune avec SQLite ordinaire (Expo Go, web) ;
//  - mauvaise clé, pas de clé, ou base en clair ouverte avec une clé ⇒ « file is not a database » ;
//  - `ATTACH … KEY` + `SELECT sqlcipher_export(…)` copie une base en clair dans une base chiffrée.

/** Ce que cette logique utilise d'une base ouverte. */
export interface CipherDb {
  exec(sql: string): Promise<void>;
  first<T>(sql: string): Promise<T | null>;
  close(): Promise<void>;
}

export interface CipherDeps<D extends CipherDb = CipherDb> {
  /** Ouvre (ou crée) le fichier `name` du dossier des bases. */
  open(name: string): Promise<D>;
  /** Chemin complet du fichier `name` (pour ATTACH). */
  pathOf(name: string): string;
  exists(name: string): Promise<boolean>;
  /** Supprime le fichier `name` et ses fichiers « -wal » et « -shm ». */
  remove(name: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Clé de la base gardée dans le coffre du système, ou null. */
  readKey(): Promise<string | null>;
  saveKey(hex: string): Promise<void>;
  /** 32 octets aléatoires, en hexadécimal (64 caractères). */
  randomKey(): Promise<string>;
  /** Vrai dans l'APK final : refuser de stocker des données de santé en clair. */
  requireEncryption: boolean;
}

/**
 * État de la base après ouverture :
 *  - `encrypted` : chiffrée par SQLCipher ;
 *  - `unencrypted` : moteur sans SQLCipher (Expo Go, développement), seulement si ce n'est pas exigé.
 */
export type CipherState = 'encrypted' | 'unencrypted';

/**
 * Ce qui a été fait à l'ouverture :
 *  - `none` : rien de spécial ;
 *  - `migrated` : une ancienne base EN CLAIR a été convertie en base chiffrée (aucune donnée perdue) ;
 *  - `reset` : base illisible (clé perdue) recréée vide ; la synchronisation recharge les données du serveur,
 *    seules les modifications jamais envoyées sont perdues.
 */
export type CipherRecovery = 'none' | 'migrated' | 'reset';

export interface OpenedDb<D extends CipherDb = CipherDb> {
  db: D;
  state: CipherState;
  recovery: CipherRecovery;
}

/** Le moteur n'a pas SQLCipher alors que le chiffrement est exigé (APK mal construit). */
export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Chiffrement de la base locale indisponible : données non enregistrées.');
    this.name = 'EncryptionUnavailableError';
  }
}

const HEX_KEY = /^[0-9a-f]{64}$/;

/** Nom de la copie chiffrée pendant une conversion (remplace ensuite la base en clair). */
export function migrationName(name: string): string {
  return name.replace(/\.db$/, '') + '.chiffrement.db';
}

/** Instruction qui donne la clé à SQLCipher (clé brute de 32 octets, en hexadécimal). */
export function keyPragma(hex: string): string {
  if (!HEX_KEY.test(hex)) throw new Error('Clé de base locale invalide');
  return `PRAGMA key = "x'${hex}'"`;
}

/** Vrai pour l'erreur « ce fichier n'est pas une base lisible » (clé absente, fausse, ou base en clair). */
export function isNotADatabase(error: unknown): boolean {
  return error instanceof Error && /file is not a database/i.test(error.message);
}

/** Lit la première page : c'est là que SQLCipher découvre si la clé est la bonne. */
async function readable(db: CipherDb): Promise<void> {
  await db.first('SELECT count(*) AS n FROM sqlite_master');
}

/** Clé du coffre, créée (et relue pour vérifier qu'elle est bien gardée) si elle n'existe pas encore. */
async function ensureKey(deps: CipherDeps<CipherDb>): Promise<string> {
  const stored = await deps.readKey();
  if (stored && HEX_KEY.test(stored)) return stored;
  const fresh = await deps.randomKey();
  if (!HEX_KEY.test(fresh)) throw new Error('Clé aléatoire invalide');
  await deps.saveKey(fresh);
  // Relecture : une clé « enregistrée » mais introuvable au prochain lancement rendrait la base illisible.
  if ((await deps.readKey()) !== fresh) throw new Error('Clé de la base locale non enregistrée');
  return fresh;
}

/** Ouvre `name` avec la clé ; `null` si le moteur n'a pas SQLCipher. */
async function openWithKey<D extends CipherDb>(deps: CipherDeps<D>, name: string, key: string) {
  const db = await deps.open(name);
  await db.exec(keyPragma(key)); // toujours la PREMIÈRE instruction
  const cipher = await db.first<{ cipher_version: string }>('PRAGMA cipher_version');
  return { db, hasCipher: Boolean(cipher?.cipher_version) };
}

/**
 * Convertit la base EN CLAIR `name` en base chiffrée, sans perte : copie chiffrée à côté (ATTACH +
 * sqlcipher_export, numéro de version compris), puis elle remplace l'originale.
 */
async function migratePlain(
  deps: CipherDeps<CipherDb>,
  name: string,
  plain: CipherDb,
  key: string,
) {
  const target = migrationName(name);
  const version =
    (await plain.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  // Le journal WAL est d'abord reversé dans le fichier : la copie part d'une base complète.
  await plain.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const path = deps.pathOf(target).replace(/'/g, "''");
  await plain.exec(`ATTACH DATABASE '${path}' AS chiffree KEY "x'${key}'"`);
  await plain.first("SELECT sqlcipher_export('chiffree')");
  await plain.exec(`PRAGMA chiffree.user_version = ${Number(version)}`);
  await plain.exec('DETACH DATABASE chiffree');
  await plain.close();
  // Arrêt brutal entre ces deux lignes : rattrapé au lancement suivant (voir openEncryptedDb).
  await deps.remove(name);
  await deps.rename(target, name);
}

/**
 * Ouvre la base `name` chiffrée. Dans l'ordre :
 *  1. termine une conversion interrompue (copie chiffrée présente) ;
 *  2. prend la clé du coffre (ou la crée) ;
 *  3. ouvre avec la clé. Sans SQLCipher : refus si le chiffrement est exigé, sinon base en clair ;
 *  4. clé refusée : base en clair ⇒ conversion ; base illisible (clé perdue) ⇒ recréée vide.
 *     Toute AUTRE erreur (disque, etc.) est remontée : on n'efface jamais une base pour une panne passagère.
 */
export async function openEncryptedDb<D extends CipherDb>(
  name: string,
  deps: CipherDeps<D>,
): Promise<OpenedDb<D>> {
  const pending = migrationName(name);
  if (await deps.exists(pending)) {
    // Copie chiffrée terminée mais pas encore à sa place : si l'originale a déjà été supprimée, la copie
    // devient la base ; sinon on recommencera la conversion depuis l'originale, toujours complète.
    if (await deps.exists(name)) await deps.remove(pending);
    else await deps.rename(pending, name);
  }

  const key = await ensureKey(deps);
  const { db, hasCipher } = await openWithKey(deps, name, key);
  if (!hasCipher) {
    if (deps.requireEncryption) {
      await db.close();
      throw new EncryptionUnavailableError();
    }
    return { db, state: 'unencrypted', recovery: 'none' };
  }

  try {
    await readable(db);
    return { db, state: 'encrypted', recovery: 'none' };
  } catch (error) {
    await db.close();
    if (!isNotADatabase(error)) throw error;
  }

  // La clé ne déchiffre pas ce fichier. Base en clair (créée avant le chiffrement) ?
  const plain = await deps.open(name);
  let isPlain = true;
  try {
    await readable(plain);
  } catch (error) {
    await plain.close();
    if (!isNotADatabase(error)) throw error;
    isPlain = false;
  }

  let recovery: CipherRecovery;
  if (isPlain) {
    await migratePlain(deps, name, plain, key);
    recovery = 'migrated';
  } else {
    // Ni la clé ni l'absence de clé ne l'ouvrent : clé perdue (ex. coffre effacé). Illisible pour toujours.
    await deps.remove(name);
    recovery = 'reset';
  }

  const reopened = await openWithKey(deps, name, key);
  await readable(reopened.db);
  return { db: reopened.db, state: 'encrypted', recovery };
}
