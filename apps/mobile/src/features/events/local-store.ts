// Où les événements (repas, activité, traitement déclaré) sont lus et écrits : TOUJOURS sur le téléphone
// d'abord (ADR-0004). L'événement et son opération de synchronisation sont écrits dans la même transaction
// (db/repositories/events.repo.ts, L8-03). Version web (aperçu, sans SQLite) : local-store.web.ts.
import type { CreateLifeEventInput } from '@glyka/shared';
import { createEvent, listEvents } from '@/db/repositories/events.repo';
import type { EventRow } from '@/db/repositories/plans';

export type LocalEvent = EventRow;

export const localEvents = {
  /** Enregistre l'événement sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). */
  save: (input: Omit<CreateLifeEventInput, 'id'>): Promise<string> => createEvent(input),

  /** Événements entre deux dates ISO (début inclus, fin exclue), du plus récent au plus ancien. */
  list: (fromIso: string, toIso: string): Promise<LocalEvent[]> => listEvents(fromIso, toIso),
};
