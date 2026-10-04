// Moteur de synchronisation (tickets L8-06, L8-07). SQUELETTE : algorithme documenté, à implémenter.
//
// ALGORITHME (ADR-0004)
//  1. Déclencheurs : retour du réseau, ouverture de l'app, tirer pour rafraîchir, après chaque écriture (anti-rebond 3 s).
//  2. Un seul cycle à la fois (verrou en mémoire). Si hors-ligne : on sort sans erreur.
//  3. PUSH : lire l'outbox (≤ 200), coalescer (coalesce.ts), POST /sync/push { deviceId, ops }.
//     - APPLIED / DUPLICATE  → supprimer l'opération de l'outbox, pending_sync = 0
//     - CONFLICT_SERVER_WINS → supprimer l'opération ; le pull ramènera la version du serveur
//     - REJECTED             → markFailed(opId, raison) ; ne bloque PAS les autres opérations
//     - erreur réseau / 5xx  → ne rien supprimer ; nouvel essai avec délai croissant (2 s, 4 s, 8 s… max 5 min)
//  4. PULL : GET /sync/pull?cursor=<kv.sync_cursor> en boucle jusqu'à épuisement ;
//     appliquer upserts ET tombstones en local SANS recréer d'opération outbox ; mettre à jour kv.sync_cursor.
//  5. Publier l'état (nb d'éléments en attente, dernière synchro réussie, erreur) pour l'interface (L8-10).
//
// Invariants à tester (L8-09) : rejouer le même lot ne crée jamais de doublon ; une suppression hors-ligne
// est propagée ; une opération invalide ne bloque pas les suivantes.

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  pendingCount: number;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export async function runSyncCycle(): Promise<SyncState> {
  // TODO(L8-06)
  return { status: 'idle', pendingCount: 0, lastSuccessAt: null, lastError: null };
}
