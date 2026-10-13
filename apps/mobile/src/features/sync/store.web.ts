// Base du moteur de synchronisation dans l'APERÇU WEB : la base en mémoire (db/web-memory.ts).
import { webMemory } from '@/db/web-memory';
import { newId } from '@/lib/uuid';
import { createMemorySyncStore } from './memory-store';

export const syncStore = createMemorySyncStore(webMemory, newId);
