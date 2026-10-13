// Base du moteur de synchronisation sur TÉLÉPHONE : SQLite (sqlite-store.ts). Aperçu web : store.web.ts.
import { getDb } from '@/db/client';
import { newId } from '@/lib/uuid';
import { createSqliteSyncStore } from './sqlite-store';

export const syncStore = createSqliteSyncStore(getDb, newId);
