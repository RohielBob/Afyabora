// Version web (aperçu de développement dans le navigateur, sans SQLite) : événements gardés EN MÉMOIRE le
// temps de la session. Mêmes plans que sur téléphone (db/repositories/plans.ts) : même forme de ligne.
import type { CreateLifeEventInput } from '@glyka/shared';
import { planEventCreate, type EventRow } from '@/db/repositories/plans';
import { newId } from '@/lib/uuid';

export type LocalEvent = EventRow;

const memory: EventRow[] = [];

export const localEvents = {
  save: async (input: Omit<CreateLifeEventInput, 'id'>): Promise<string> => {
    const { row } = planEventCreate(
      { ...input, id: newId() },
      { opId: newId(), now: new Date().toISOString() },
    );
    memory.push(row);
    return row.id;
  },
  list: async (fromIso: string, toIso: string): Promise<LocalEvent[]> =>
    memory
      .filter((e) => e.occurred_at >= fromIso && e.occurred_at < toIso)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0)),
};
