// Modifications REFUSÉES par le serveur (L8-10). Le moteur (L8-06) les garde dans la file d'envoi avec leur
// raison, sans les renvoyer. La personne les voit sur l'écran « Synchronisation » et choisit :
//  - « Réessayer » : la modification repart au prochain envoi (ex. l'horloge du téléphone était en avance) ;
//  - « Abandonner » : la modification est retirée de ce téléphone, et la version enregistrée sur le compte
//    revient à la synchronisation suivante (curseur remis à zéro). Si la donnée n'a jamais existé sur le
//    compte (création refusée), elle disparaît simplement du téléphone.
// Ce fichier : les types et la description PURE (testée) d'une modification refusée pour l'écran.
import type { LifeEventType, MeasurementContext } from '@glyka/shared';
import type { EventRow, MeasurementRow } from '@/db/repositories/plans';
import type { SyncEntity } from './rules';

/** Une modification refusée, telle que la base locale la donne. */
export interface RejectedChange {
  opId: string;
  entity: SyncEntity;
  entityId: string;
  type: 'upsert' | 'delete';
  /** Raison donnée par le serveur (en français, sans donnée de santé). */
  reason: string;
  /** Nombre de refus. */
  attempts: number;
  /** La donnée sur le téléphone (null si elle n'y est plus). */
  measurement: MeasurementRow | null;
  event: EventRow | null;
}

/** Opérations sur les modifications refusées (base du téléphone ou de l'aperçu web). */
export interface RejectedStore {
  listRejected(): Promise<RejectedChange[]>;
  /** La modification repart au prochain envoi. */
  retryRejected(opId: string): Promise<void>;
  /** Modifications de cette donnée retirées, donnée retirée du téléphone, curseur remis à zéro. */
  discardRejected(opId: string): Promise<void>;
}

/** Ce que l'écran affiche d'une modification refusée. */
export type RejectedView =
  | {
      kind: 'measurement';
      action: 'save' | 'delete';
      valueMgDl: number | null;
      at: string | null;
      context: MeasurementContext | null;
      reason: string;
      attempts: number;
    }
  | {
      kind: 'event';
      action: 'save' | 'delete';
      eventType: LifeEventType | null;
      label: string | null;
      at: string | null;
      reason: string;
      attempts: number;
    };

export function describeRejected(change: RejectedChange): RejectedView {
  const action = change.type === 'delete' ? 'delete' : 'save';
  if (change.entity === 'measurement') {
    const m = change.measurement;
    return {
      kind: 'measurement',
      action,
      valueMgDl: m?.value_mgdl ?? null,
      at: m?.measured_at ?? null,
      context: m?.context ?? null,
      reason: change.reason,
      attempts: change.attempts,
    };
  }
  const e = change.event;
  return {
    kind: 'event',
    action,
    eventType: e?.type ?? null,
    label: e?.label ?? null,
    at: e?.occurred_at ?? null,
    reason: change.reason,
    attempts: change.attempts,
  };
}
