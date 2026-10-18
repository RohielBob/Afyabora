// Suivi en direct d'un partage (L5-08, CDC F7 étapes 5 et 6) : l'application interroge l'état de la session
// (GET /shares/:id/status) pour savoir, sans attendre, que le médecin a scanné, combien de temps il lui
// reste, et quand l'accès se termine (expiré ou arrêté). Contrôleur sans écran, testé avec une horloge
// simulée (__tests__/watch.test.ts).
//
// Rythme : toutes les 3 s tant que le QR attend son scan (le patient voit « Dr X consulte » presque tout de
// suite) ; toutes les 10 s pendant l'accès (une fin décidée ailleurs se voit vite) ; et tout de suite quand
// le minuteur arrive à zéro. Pas de réseau : nouvel essai à 2 s, 4 s, 8 s puis 15 s, sans rien effacer.
//
// Horloge : le SERVEUR donne les secondes restantes (`remainingSeconds`) ; le téléphone compte à rebours à
// partir de la réception de la réponse. On ne compare jamais l'heure du téléphone à `expiresAt`.
import type { DoctorIdentity, ShareStatusResponse } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import { retryDelayMs } from './rotation';

export const WAITING_POLL_MS = 3000;
export const ACTIVE_POLL_MS = 10_000;

export type ShareView =
  /** Le QR attend son scan. */
  | { kind: 'waiting' }
  /** Un médecin consulte : fin estimée sur l'horloge du téléphone, d'après le serveur. */
  | { kind: 'active'; doctor: DoctorIdentity | null; endsAt: number; expiresAt: string | null }
  /** Accès terminé : arrivé à son terme, ou arrêté (par le patient, ici ou sur un autre appareil). */
  | { kind: 'ended'; reason: 'expired' | 'revoked'; doctor: DoctorIdentity | null };

export interface WatchState {
  view: ShareView;
  /** Dernière lecture ratée (pas de réseau…) ; l'écran garde la dernière vue connue. */
  problem: 'offline' | 'error' | null;
  failures: number;
}

/** Réponse du serveur ⇒ ce que l'écran montre. `receivedAt` : heure du téléphone à la réception. */
export function viewOf(status: ShareStatusResponse, receivedAt: number): ShareView {
  switch (status.status) {
    case 'PENDING':
      return { kind: 'waiting' };
    case 'ACTIVE':
      return {
        kind: 'active',
        doctor: status.doctor,
        endsAt: receivedAt + (status.remainingSeconds ?? 0) * 1000,
        expiresAt: status.expiresAt,
      };
    case 'REVOKED':
      return { kind: 'ended', reason: 'revoked', doctor: status.doctor };
    default:
      return { kind: 'ended', reason: 'expired', doctor: status.doctor };
  }
}

/** Secondes d'accès restantes (arrondies au-dessus, jamais négatives). */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** « 04:37 », ou « 1:59:30 » au-delà d'une heure (consultation : 2 h). */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

export interface WatcherDeps {
  sessionId: string;
  getStatus: (sessionId: string) => Promise<ShareStatusResponse>;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onChange: (state: WatchState) => void;
}

export interface ShareWatcher {
  get: () => WatchState;
  /** Relit l'état tout de suite (retour dans l'application, après « Mettre fin à l'accès »). */
  refresh: () => void;
  /** Application en arrière-plan : plus de lecture jusqu'à `refresh`. */
  pause: () => void;
  /** Écran fermé : plus aucune lecture ; une réponse en route est ignorée. */
  stop: () => void;
}

export function createShareWatcher(deps: WatcherDeps): ShareWatcher {
  let state: WatchState = { view: { kind: 'waiting' }, problem: null, failures: 0 };
  let timer: unknown = null;
  let inFlight = false;
  let stopped = false;
  let paused = false;
  let again = false; // une lecture a été demandée pendant qu'une autre était en route

  const set = (next: Partial<WatchState>) => {
    state = { ...state, ...next };
    deps.onChange(state);
  };
  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    if (stopped || paused) return;
    timer = deps.setTimer(() => {
      timer = null;
      void poll();
    }, ms);
  };

  /** Prochaine lecture selon ce qu'on montre ; aucune une fois l'accès terminé. */
  const scheduleNext = () => {
    const { view } = state;
    if (view.kind === 'ended') return;
    if (view.kind === 'waiting') return schedule(WAITING_POLL_MS);
    // Pendant l'accès : toutes les 10 s, et pile à la fin du minuteur.
    schedule(Math.max(0, Math.min(ACTIVE_POLL_MS, view.endsAt - deps.now())));
  };

  async function poll(): Promise<void> {
    if (stopped || paused) return;
    if (inFlight) {
      again = true;
      return;
    }
    clear();
    inFlight = true;
    try {
      const status = await deps.getStatus(deps.sessionId);
      if (stopped) return;
      set({ view: viewOf(status, deps.now()), problem: null, failures: 0 });
      scheduleNext();
    } catch (error) {
      if (stopped) return;
      // 404 : la session n'existe plus (compte supprimé ailleurs…) : l'accès est terminé.
      if (error instanceof ApiError && error.status === 404) {
        const doctor = state.view.kind === 'waiting' ? null : state.view.doctor;
        set({ view: { kind: 'ended', reason: 'revoked', doctor }, problem: null, failures: 0 });
        return;
      }
      const failures = state.failures + 1;
      const problem = error instanceof ApiError && error.status === 0 ? 'offline' : 'error';
      set({ problem, failures });
      schedule(retryDelayMs(failures));
    } finally {
      inFlight = false;
      if (again && !stopped) {
        again = false;
        void poll();
      }
    }
  }

  void poll();

  return {
    get: () => state,
    refresh() {
      if (stopped || state.view.kind === 'ended') return;
      paused = false;
      void poll();
    },
    pause() {
      paused = true;
      clear();
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
