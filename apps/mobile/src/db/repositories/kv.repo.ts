// Table clé/valeur de la base locale (`kv`, schéma v1) : petites valeurs liées AU COMPTE connecté, comme les
// seuils du profil (L2-04) ou, plus tard, le curseur de synchronisation (L8). Elle est vidée à la déconnexion
// avec le reste des données de santé (db/reset.ts) : le compte suivant ne voit jamais celles du précédent.
import { getDb } from '../client';

/** Valeur enregistrée sous `key`, ou null si absente. */
export async function readKv(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

/** Crée ou remplace la valeur de `key`. */
export async function writeKv(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
