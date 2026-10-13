// Où les événements (repas, activité, traitement déclaré) sont lus et écrits : TOUJOURS sur le téléphone
// d'abord (ADR-0004). L'événement et son opération de synchronisation sont écrits dans la même transaction
// (db/repositories/events.repo.ts, L8-03), puis envoyés au serveur 3 s plus tard par le moteur de
// synchronisation (L8-06). Version web (aperçu, sans SQLite) : local-store.web.ts.
import type { CreateLifeEventInput } from '@glyka/shared';
import { createEvent, listEvents } from '@/db/repositories/events.repo';
import type { EventRow } from '@/db/repositories/plans';
import { syncAfterLocalWrite } from '@/features/sync';

export type LocalEvent = EventRow;

export const localEvents = {
  /** Enregistre l'événement sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). */
  save: async (input: Omit<CreateLifeEventInput, 'id'>): Promise<string> => {
    const id = await createEvent(input);
    syncAfterLocalWrite();
    return id;
  },

  /** Événements entre deux dates ISO (début inclus, fin exclue), du plus récent au plus ancien. */
  list: (fromIso: string, toIso: string): Promise<LocalEvent[]> => listEvents(fromIso, toIso),
};
