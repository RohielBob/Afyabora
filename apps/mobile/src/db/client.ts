// Ouverture de la base locale : CHIFFRÉE (L8-02, voir encryption.ts), puis migrations du schéma.
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  openEncryptedDb,
  type CipherDb,
  type CipherDeps,
  type CipherRecovery,
  type CipherState,
} from './encryption';
import { MIGRATIONS } from './schema';

const DB_NAME = 'glyka.db';
/** Clé de la base dans le coffre du système (SecureStore). Ne jamais l'afficher ni la journaliser. */
const KEY_ITEM = 'glyka.dbKey';
// Disponible après le premier déverrouillage du téléphone (comme les jetons de session) et jamais copiée
// vers un autre appareil (sauvegarde iCloud, transfert).
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Protection des données de santé sur cet appareil, affichée dans Réglages → Sécurité. */
export interface DbProtection {
  /** `web` : aperçu web, rien n'est enregistré sur l'appareil (base en mémoire, web-memory.ts). */
  state: CipherState | 'web';
  recovery: CipherRecovery;
}

/** Base expo-sqlite vue par encryption.ts. */
interface NativeDb extends CipherDb {
  raw: SQLite.SQLiteDatabase;
}

let dbPromise: Promise<{ db: SQLite.SQLiteDatabase; protection: DbProtection }> | null = null;

/** Ouvre la base (une seule fois) et applique les migrations manquantes. */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return (await opened()).db;
}

/** État du chiffrement de la base locale (ouvre la base si besoin). */
export async function getDbProtection(): Promise<DbProtection> {
  if (Platform.OS === 'web') return { state: 'web', recovery: 'none' };
  return (await opened()).protection;
}

function opened() {
  if (!dbPromise) {
    const attempt = open();
    dbPromise = attempt;
    // Échec (ex. coffre indisponible) : le prochain appel réessaie au lieu de garder l'erreur pour toujours.
    attempt.catch(() => {
      if (dbPromise === attempt) dbPromise = null;
    });
  }
  return dbPromise;
}

// `defaultDatabaseDirectory` est un CHEMIN (ex. /data/user/0/com.glyka.app/files/SQLite), pas une adresse file://.
const pathOf = (name: string) => `${SQLite.defaultDatabaseDirectory}/${name}`;
const fileOf = (name: string) => new File(`file://${pathOf(name)}`);

/** Branchement de encryption.ts sur expo-sqlite, le système de fichiers et SecureStore. */
const nativeDeps: CipherDeps<NativeDb> = {
  async open(name) {
    const raw = await SQLite.openDatabaseAsync(name);
    return {
      raw,
      exec: (sql) => raw.execAsync(sql),
      first: (sql) => raw.getFirstAsync(sql),
      close: () => raw.closeAsync(),
    };
  },
  pathOf,
  exists: async (name) => fileOf(name).exists,
  async remove(name) {
    for (const file of [name, `${name}-wal`, `${name}-shm`].map(fileOf)) {
      if (file.exists) file.delete();
    }
  },
  async rename(from, to) {
    fileOf(from).rename(to); // même dossier, nouveau nom
  },
  readKey: () => SecureStore.getItemAsync(KEY_ITEM, KEY_OPTIONS),
  saveKey: (hex) => SecureStore.setItemAsync(KEY_ITEM, hex, KEY_OPTIONS),
  async randomKey() {
    const bytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  },
  // APK final : jamais de données de santé en clair. En développement (Expo Go n'a pas SQLCipher), la base
  // reste en clair, et Réglages → Sécurité l'indique.
  requireEncryption: !__DEV__,
};

async function open(): Promise<{ db: SQLite.SQLiteDatabase; protection: DbProtection }> {
  const { db: handle, state, recovery } = await openEncryptedDb(DB_NAME, nativeDeps);
  const db = handle.raw;

  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v] as string);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return { db, protection: { state, recovery } };
}
