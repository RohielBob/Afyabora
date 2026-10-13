// Données de santé locales et déconnexion (ADR-0004, modification 3) : un téléphone = un compte à la fois.
// À la déconnexion, la base locale est vidée pour que le compte suivant ne voie jamais les données du précédent.
//
// Robustesse : une base qui ne répond pas ne doit JAMAIS bloquer l'interface (ex. bouton « Se déconnecter »
// qui ne réagit plus). Sur le web (aperçu de développement), la base SQLite n'est pas utilisée : on n'y touche
// pas : il a sa base en mémoire (web-memory.ts), vidée elle aussi. Sur téléphone, chaque opération a une
// limite de temps.
import { Platform } from 'react-native';
import { getDb } from './client';
import { pendingCount } from './repositories/outbox.repo';
import { clearWebMemory, webMemory } from './web-memory';

const DB_TIMEOUT_MS = 4_000;

/** Exécute `task`, ou abandonne (et renvoie `fallback`) au-delà du délai ou en cas d'erreur. */
async function withTimeout<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  if (Platform.OS === 'web') return fallback;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), DB_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Nombre d'opérations pas encore envoyées au serveur (mesures, événements). 0 si la base est indisponible. */
export function countUnsyncedChanges(): Promise<number> {
  if (Platform.OS === 'web') return Promise.resolve(webMemory.outbox.length);
  return withTimeout(async () => pendingCount(await getDb()), 0);
}

/** Vide toutes les tables locales (mesures, événements, file d'envoi, curseur de synchronisation). */
export function wipeLocalData(): Promise<void> {
  if (Platform.OS === 'web') {
    clearWebMemory();
    return Promise.resolve();
  }
  return withTimeout(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync(
        'DELETE FROM measurements; DELETE FROM events; DELETE FROM outbox; DELETE FROM kv;',
      );
    });
  }, undefined);
}

/** Clé `kv` : compte à qui appartiennent les données locales (ADR-0004, modifications 3 et 6). */
const KV_OWNER = 'local_owner';

/**
 * À la connexion, que faire des données locales ?
 *  - aucune donnée attribuée (premier compte) ⇒ les attribuer à ce compte ;
 *  - même compte (session expirée puis reconnexion) ⇒ tout garder, file d'envoi comprise (modification 6) ;
 *  - AUTRE compte ⇒ tout effacer d'abord : ses modifications non envoyées ne doivent jamais partir sur le
 *    compte qui se connecte (modification 3).
 */
export function ownerAction(previous: string | null, userId: string): 'claim' | 'keep' | 'wipe' {
  if (previous === null) return 'claim';
  return previous === userId ? 'keep' : 'wipe';
}

/** Rattache la base locale au compte qui se connecte (voir ownerAction). */
export function claimLocalData(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (ownerAction(webMemory.kv.get(KV_OWNER) ?? null, userId) === 'wipe') clearWebMemory();
    webMemory.kv.set(KV_OWNER, userId);
    return Promise.resolve();
  }
  return withTimeout(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM kv WHERE key = ?',
        KV_OWNER,
      );
      if (ownerAction(row?.value ?? null, userId) === 'wipe') {
        await db.execAsync(
          'DELETE FROM measurements; DELETE FROM events; DELETE FROM outbox; DELETE FROM kv;',
        );
      }
      await db.runAsync(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        KV_OWNER,
        userId,
      );
    });
  }, undefined);
}
