// Moteur de synchronisation du téléphone (ticket L8-06, CDC F11, ADR-0004).
//
// Ce fichier ne connaît ni SQLite ni le réseau : la base (`SyncStore`) et l'API (`SyncApi`) lui sont
// FOURNIES. Il se teste donc entièrement dans Jest (__tests__/engine.test.ts) ; service.ts le branche sur la
// vraie base et la vraie API.
//
// CYCLE (un seul à la fois ; une demande pendant un cycle en relance un juste après)
//  1. Session absente ⇒ rien à faire.
//  2. ENVOI : file d'envoi (outbox) par lots de 200, coalescée (rules.ts), POST /sync/push.
//     - APPLIED / DUPLICATE / CONFLICT_SERVER_WINS ⇒ opération retirée de la file ; la donnée n'est plus
//       « en attente » s'il ne reste rien pour elle ;
//     - CONFLICT_SERVER_WINS ⇒ en plus, curseur de réception remis à zéro : la version du serveur revient ;
//     - REJECTED ⇒ gardée avec sa raison, plus renvoyée ; ne bloque PAS les autres.
//     On recommence tant qu'il reste des opérations (20 lots au plus par cycle).
//  3. RÉCEPTION : GET /sync/pull depuis le curseur gardé, page après page jusqu'à `hasMore` faux. Chaque page
//     est appliquée (données ET suppressions) puis le curseur enregistré, dans UNE transaction : une coupure
//     au milieu fait relire la page, jamais la sauter. Rien n'est remis dans la file d'envoi.
//     Curseur refusé (400) ⇒ on repart du début, une fois.
//  4. ÉTAT publié pour l'interface (L8-10) : en attente, refusées, dernière synchronisation réussie, erreur.
//
// ÉCHECS : réseau coupé, serveur en panne (5xx), trop de requêtes (429), réponse illisible ou base locale
// en erreur ⇒ rien n'est perdu (la file n'est vidée qu'après la réponse) et un nouvel essai est programmé
// avec un délai croissant : 2 s, 4 s, 8 s… jusqu'à 5 minutes. Session expirée (401) ⇒ on s'arrête : la
// personne doit se reconnecter.
// HORS-LIGNE CONNU (mode avion, L8-07) : le téléphone sait qu'il n'a pas de réseau ⇒ aucune requête, pas
// d'essai toutes les 2 s (batterie) : le retour du réseau relance la synchronisation (triggers.ts) ; un
// essai de secours est tout de même programmé dans 5 minutes, au cas où la détection se tromperait.
//
// CHANGEMENT DE COMPTE : stop() empêche tout cycle en cours d'écrire encore dans la base (il attend la fin
// de l'écriture en cours, jamais celle d'une requête réseau). La déconnexion l'appelle AVANT d'effacer la
// base : les données d'un compte ne peuvent pas réapparaître dans le suivant.
import type {
  LifeEventDto,
  MeasurementDto,
  SyncOp,
  SyncPullResponse,
  SyncPushResponse,
} from '@glyka/shared';
import type { OutboxRow } from '@/db/repositories/outbox.repo';
import {
  MAX_CHAINED_CYCLES,
  MAX_PULL_PAGES,
  MAX_PUSH_BATCHES,
  PULL_PAGE,
  PUSH_BATCH,
  RETRY_MAX_MS,
  buildPushBatch,
  retryDelay,
  settle,
  type Settlement,
} from './rules';

/** Pourquoi la dernière synchronisation a échoué (l'interface traduit ce code, L8-10). */
export type SyncErrorCode = 'offline' | 'server' | 'session' | 'refused' | 'local';

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  /** Modifications pas encore envoyées (hors opérations refusées). */
  pendingCount: number;
  /** Opérations refusées par le serveur, gardées avec leur raison. */
  failedCount: number;
  /** Dernière synchronisation complète réussie (ISO UTC), ou null. */
  lastSuccessAt: string | null;
  lastError: SyncErrorCode | null;
  /** Prochain essai automatique programmé (ISO UTC), ou null. */
  nextRetryAt: string | null;
}

export const INITIAL_SYNC_STATE: SyncState = {
  status: 'idle',
  pendingCount: 0,
  failedCount: 0,
  lastSuccessAt: null,
  lastError: null,
  nextRetryAt: null,
};

/** Base locale vue par le moteur : SQLite sur téléphone (db/repositories/sync.repo.ts), mémoire sur le web. */
export interface SyncStore {
  /** Identifiant de cet appareil (créé au premier appel, gardé ensuite). */
  deviceId(): Promise<string>;
  /** Opérations à envoyer, dans l'ordre (les refusées sont exclues). */
  readOutbox(limit: number): Promise<OutboxRow[]>;
  /** Règle les opérations envoyées ; `resetCursor` remet le curseur de réception à zéro. UNE transaction. */
  settle(settlements: Settlement[], resetCursor: boolean): Promise<void>;
  readCursor(): Promise<string | null>;
  resetCursor(): Promise<void>;
  /** Applique une page reçue PUIS enregistre `nextCursor`, dans UNE transaction ; renvoie les données écrites. */
  applyPull(
    page: { measurements: MeasurementDto[]; events: LifeEventDto[] },
    nextCursor: string | null,
  ): Promise<number>;
  counts(): Promise<{ pending: number; failed: number }>;
  readLastSuccess(): Promise<string | null>;
  writeLastSuccess(iso: string): Promise<void>;
}

/** API vue par le moteur (réponses déjà vérifiées par les schémas partagés, service.ts). */
export interface SyncApi {
  push(body: { deviceId: string; ops: SyncOp[] }): Promise<SyncPushResponse>;
  pull(cursor: string | null, limit: number): Promise<SyncPullResponse>;
}

export interface SyncDeps {
  store: SyncStore;
  api: SyncApi;
  /** Une session est ouverte (jeton présent) : sinon, aucun cycle. */
  canSync: () => Promise<boolean>;
  /** Le téléphone a du réseau (NetInfo) ; absent = toujours vrai. Hors-ligne connu ⇒ aucune requête. */
  isOnline?: () => Promise<boolean>;
  now?: () => Date;
}

export interface SyncEngine {
  /** Demande une synchronisation dans `delayMs` (0 = tout de suite). Plusieurs demandes se regroupent. */
  request(delayMs?: number): void;
  /** Lance un cycle maintenant et attend sa fin (tests, « tirer pour rafraîchir » L8-07). */
  runNow(): Promise<SyncState>;
  /** Arrête tout (déconnexion) : plus aucune écriture du cycle en cours ; attend l'écriture en cours. */
  stop(): Promise<void>;
  getState(): SyncState;
  subscribe(listener: () => void): () => void;
  /** Appelé quand la réception a modifié des données locales (la chronologie se recharge). */
  onDataChanged(listener: () => void): () => void;
}

/** Échec d'un appel à l'API ou à la base, avec son code pour l'interface. */
class SyncFailure extends Error {
  constructor(
    readonly code: SyncErrorCode,
    readonly retry: boolean,
    /** Délai imposé avant le nouvel essai (sinon : délai croissant). */
    readonly delayMs?: number,
  ) {
    super(code);
  }
}

/** Le cycle a été arrêté (déconnexion) : on sort sans rien écrire ni publier. */
class Stopped extends Error {}

/** Erreur d'API ⇒ code : statut 0 = réseau, 401 = session, 4xx = refus, sinon serveur. */
function apiFailure(error: unknown): SyncFailure {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return new SyncFailure('server', true); // réponse illisible
  if (status === 0) return new SyncFailure('offline', true);
  if (status === 401) return new SyncFailure('session', false);
  if (status === 429 || status >= 500) return new SyncFailure('server', true);
  return new SyncFailure('refused', true);
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const now = deps.now ?? (() => new Date());
  let state: SyncState = { ...INITIAL_SYNC_STATE };
  const listeners = new Set<() => void>();
  const dataListeners = new Set<() => void>();

  let running: Promise<SyncState> | null = null;
  let runningGeneration = -1;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerAt = 0;
  let failures = 0;
  /** Change à chaque stop() : un cycle lancé avant ne peut plus écrire. */
  let generation = 0;
  let writing: Promise<unknown> = Promise.resolve();

  const publish = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  /** Écriture dans la base, refusée si le moteur a été arrêté depuis le début du cycle. */
  const write = async <T>(gen: number, task: () => Promise<T>): Promise<T> => {
    if (gen !== generation) throw new Stopped();
    const pending = task();
    writing = pending.catch(() => undefined);
    try {
      return await pending;
    } catch {
      throw new SyncFailure('local', true);
    }
  };

  const read = async <T>(gen: number, task: () => Promise<T>): Promise<T> => {
    if (gen !== generation) throw new Stopped();
    try {
      return await task();
    } catch {
      throw new SyncFailure('local', true);
    }
  };

  const call = async <T>(gen: number, task: () => Promise<T>): Promise<T> => {
    if (gen !== generation) throw new Stopped();
    try {
      return await task();
    } catch (error) {
      throw apiFailure(error);
    }
  };

  const schedule = (delayMs: number) => {
    const at = now().getTime() + delayMs;
    if (timer !== null && timerAt <= at) return; // une demande plus proche est déjà prévue
    if (timer !== null) clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(() => {
      timer = null;
      void start();
    }, delayMs);
  };

  async function push(gen: number): Promise<void> {
    const deviceId = await write(gen, () => deps.store.deviceId());
    for (let batch = 0; batch < MAX_PUSH_BATCHES; batch++) {
      const rows = await read(gen, () => deps.store.readOutbox(PUSH_BATCH));
      if (rows.length === 0) return;
      const { ops, sent } = buildPushBatch(rows);
      const response = await call(gen, () => deps.api.push({ deviceId, ops }));
      const outcome = settle(sent, response.results);
      await write(gen, () => deps.store.settle(outcome.settlements, outcome.conflict));
      // Le serveur n'a pas répondu pour certaines opérations : on ne boucle pas, on réessaiera plus tard.
      if (outcome.unanswered > 0) throw new SyncFailure('server', true);
    }
    again = true; // encore des opérations : un nouveau cycle les enverra
  }

  async function pull(gen: number): Promise<void> {
    let cursor = await read(gen, () => deps.store.readCursor());
    let restarted = false;
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      let response: SyncPullResponse;
      try {
        response = await call(gen, () => deps.api.pull(cursor, PULL_PAGE));
      } catch (error) {
        // Curseur refusé (base du serveur restaurée, curseur abîmé) : on repart du début, UNE fois.
        if (error instanceof SyncFailure && error.code === 'refused' && cursor && !restarted) {
          restarted = true;
          await write(gen, () => deps.store.resetCursor());
          cursor = null;
          page--;
          continue;
        }
        throw error;
      }
      const changed = await write(gen, () =>
        deps.store.applyPull(
          { measurements: response.measurements, events: response.events },
          response.nextCursor,
        ),
      );
      if (changed > 0) dataListeners.forEach((listener) => listener());
      cursor = response.nextCursor;
      if (!response.hasMore) return;
    }
    again = true; // encore des pages : un nouveau cycle les lira
  }

  async function cycle(gen: number): Promise<SyncState> {
    publish({ status: 'syncing', nextRetryAt: null });
    try {
      if (!(await deps.canSync())) {
        publish({ status: 'idle' });
        return state;
      }
      if (deps.isOnline && !(await deps.isOnline().catch(() => true))) {
        throw new SyncFailure('offline', true, RETRY_MAX_MS);
      }
      await push(gen);
      await pull(gen);
      const success = now().toISOString();
      await write(gen, () => deps.store.writeLastSuccess(success));
      const counts = await read(gen, () => deps.store.counts());
      failures = 0;
      publish({
        status: 'idle',
        pendingCount: counts.pending,
        failedCount: counts.failed,
        lastSuccessAt: success,
        lastError: null,
      });
    } catch (error) {
      if (error instanceof Stopped || gen !== generation) return state;
      const failure = error instanceof SyncFailure ? error : new SyncFailure('local', true);
      const counts = await deps.store.counts().catch(() => null);
      let nextRetryAt: string | null = null;
      if (failure.retry) {
        failures++;
        const delay = failure.delayMs ?? retryDelay(failures);
        nextRetryAt = new Date(now().getTime() + delay).toISOString();
        schedule(delay);
      }
      publish({
        status: failure.code === 'offline' ? 'offline' : 'error',
        lastError: failure.code,
        nextRetryAt,
        ...(counts ? { pendingCount: counts.pending, failedCount: counts.failed } : {}),
      });
    }
    return state;
  }

  function start(): Promise<SyncState> {
    // Cycle d'AVANT un stop() encore en vol (requête réseau) : il n'écrira plus rien ; on attend sa fin
    // pour lancer celui du compte actuel.
    if (running && runningGeneration !== generation) return running.then(() => start());
    if (running) {
      again = true;
      return running;
    }
    const gen = generation;
    runningGeneration = gen;
    running = (async () => {
      try {
        let result = await cycle(gen);
        // Demandes arrivées pendant le cycle (saisie, lot suivant) : un cycle de plus, sans attendre.
        // Au-delà de MAX_CHAINED_CYCLES, la suite est programmée après une pause : jamais de boucle sans fin.
        let chained = 1;
        while (again && gen === generation && result.status === 'idle') {
          again = false;
          if (chained++ >= MAX_CHAINED_CYCLES) {
            schedule(retryDelay(1));
            break;
          }
          result = await cycle(gen);
        }
        return result;
      } finally {
        again = false;
        running = null;
      }
    })();
    return running;
  }

  return {
    request(delayMs = 0) {
      if (running && runningGeneration === generation) {
        again = true;
        return;
      }
      schedule(delayMs);
    },
    runNow() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return start();
    },
    async stop() {
      generation++;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      again = false;
      failures = 0;
      await writing;
      state = { ...INITIAL_SYNC_STATE };
      listeners.forEach((listener) => listener());
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onDataChanged(listener) {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
  };
}
