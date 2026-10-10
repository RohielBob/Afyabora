// Données de santé locales et déconnexion (ADR-0004, modification 3) : un téléphone = un compte à la fois.
// À la déconnexion, la base locale est vidée pour que le compte suivant ne voie jamais les données du précédent.
//
// Robustesse : une base qui ne répond pas ne doit JAMAIS bloquer l'interface (ex. bouton « Se déconnecter »
// qui ne réagit plus). Sur le web (aperçu de développement), la base SQLite n'est pas utilisée : on n'y touche
// pas. Sur téléphone, chaque opération a une limite de temps.
import { Platform } from 'react-native';
import { getDb } from './client';
import { pendingCount } from './repositories/outbox.repo';

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
  return withTimeout(async () => pendingCount(await getDb()), 0);
}

/** Vide toutes les tables locales (mesures, événements, file d'envoi, curseur de synchronisation). */
export function wipeLocalData(): Promise<void> {
  return withTimeout(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync(
        'DELETE FROM measurements; DELETE FROM events; DELETE FROM outbox; DELETE FROM kv;',
      );
    });
  }, undefined);
}
