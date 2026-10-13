// Version web (aperçu de développement dans le navigateur, sans SQLite) : événements gardés EN MÉMOIRE le
// temps de la session (db/web-memory.ts), avec leur file d'envoi : depuis L8-06, l'aperçu web se
// synchronise comme un téléphone. Mêmes plans que sur téléphone (db/repositories/plans.ts) : même forme.
import type { CreateLifeEventInput } from '@glyka/shared';
import { planEventCreate, type EventRow } from '@/db/repositories/plans';
import { enqueueInMemory, webMemory } from '@/db/web-memory';
import { syncAfterLocalWrite } from '@/features/sync';
import { newId } from '@/lib/uuid';

export type LocalEvent = EventRow;

export const localEvents = {
  save: async (input: Omit<CreateLifeEventInput, 'id'>): Promise<string> => {
    const plan = planEventCreate(
      { ...input, id: newId() },
      { opId: newId(), now: new Date().toISOString() },
    );
    webMemory.events.set(plan.row.id, plan.row);
    enqueueInMemory(webMemory, plan.op);
    syncAfterLocalWrite();
    return plan.row.id;
  },
  /** Événements non supprimés (une suppression peut venir du serveur) entre deux dates ISO. */
  list: async (fromIso: string, toIso: string): Promise<LocalEvent[]> =>
    [...webMemory.events.values()]
      .filter((e) => !e.deleted_at && e.occurred_at >= fromIso && e.occurred_at < toIso)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0)),
};
