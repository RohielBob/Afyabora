// Événements de vie (repas, activité, traitement DÉCLARÉ par le patient) : lecture/écriture LOCALE (L8-03).
// Toute écriture empile une opération dans l'outbox, dans la même transaction (write.ts) ; la logique est
// dans plans.ts (testée). Utilisé par la chronologie (L2-09) et l'ajout rapide d'un événement (L2-10).
import type { CreateLifeEventInput, UpdateLifeEventInput } from '@glyka/shared';
import { newId } from '@/lib/uuid';
import { getDb } from '../client';
import { planEventCreate, planEventDelete, planEventUpdate, type EventRow } from './plans';
import { LocalNotFound, applyPlan } from './write';

const nowIso = () => new Date().toISOString();

/** Crée un événement sur le téléphone ; renvoie son identifiant (généré ici, hors-ligne). */
export async function createEvent(input: Omit<CreateLifeEventInput, 'id'>): Promise<string> {
  const db = await getDb();
  const plan = planEventCreate({ ...input, id: newId() }, { opId: newId(), now: nowIso() });
  await db.withTransactionAsync(() => applyPlan(db, 'events', plan));
  return plan.row.id;
}

/** Événement non supprimé, ou null. */
export async function getEvent(id: string): Promise<EventRow | null> {
  const db = await getDb();
  return db.getFirstAsync<EventRow>('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', id);
}

/** Modifie un événement (champs donnés seulement) ; l'objet complet part à la synchronisation. */
export async function updateEvent(id: string, patch: UpdateLifeEventInput): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<EventRow>(
      'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!current) throw new LocalNotFound('Événement', id);
    await applyPlan(
      db,
      'events',
      planEventUpdate(current, patch, { opId: newId(), now: nowIso() }),
    );
  });
}

/** Supprime un événement (pierre tombale, détails effacés). Déjà supprimé ou absent : rien à faire. */
export async function deleteEvent(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<EventRow>(
      'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!current) return;
    await applyPlan(db, 'events', planEventDelete(current, { opId: newId(), now: nowIso() }));
  });
}

/**
 * Événements non supprimés entre deux dates ISO UTC (début inclus, fin exclue), du plus récent au plus
 * ancien (ordre de la chronologie, CDC F4).
 */
export async function listEvents(fromIso: string, toIso: string): Promise<EventRow[]> {
  const db = await getDb();
  return db.getAllAsync<EventRow>(
    `SELECT * FROM events
     WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
     ORDER BY occurred_at DESC`,
    fromIso,
    toIso,
  );
}
