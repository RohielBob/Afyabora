// QR qui tourne (L5-07, CDC F7 étape 4, ADR-0003) : le jeton affiché vaut 60 s et ne sert qu'une fois ; tant
// que le médecin n'a pas scanné, l'application en demande un nouveau (GET /shares/:id/token) un peu AVANT
// la fin, pour que le QR à l'écran soit toujours valable au moment du scan. Contrôleur sans écran, testé
// avec une horloge simulée (__tests__/rotation.test.ts) ; l'écran ne fait que l'afficher.
//
// Horloge : on ne compare JAMAIS l'heure du téléphone à `expiresAt` du serveur (un téléphone en avance de
// 2 min croirait chaque QR déjà expiré et le renouvellerait sans fin). On compte 60 s à partir de la
// RÉCEPTION du jeton : c'est une estimation prudente, le jeton a été émis juste avant.
//
// Réponses du serveur à une rotation :
//  - nouveau jeton ⇒ affiché, prochaine rotation dans 50 s ;
//  - 409 SESSION_NOT_PENDING ⇒ le QR a été scanné (ou le partage s'est terminé) : on arrête de tourner ;
//  - 404 ⇒ le partage n'existe plus : on arrête ;
//  - pas de réseau, 429, 503, autre ⇒ nouvel essai de plus en plus espacé (2 s, 4 s, 8 s, 15 s au plus).
//    Le QR encore à l'écran reste montré tant qu'il est valable, puis il est masqué (« QR expiré ») : un QR
//    qui ne marche plus ne doit pas être présenté au médecin.
import { SHARE_TOKEN_TTL_SECONDS, type ShareTokenDto } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

/** Durée de vie d'un jeton, comptée à partir de sa réception. */
export const TOKEN_LIFE_MS = SHARE_TOKEN_TTL_SECONDS * 1000;
/** Marge avant la fin : le médecin a toujours au moins 10 s pour scanner un QR affiché. */
export const ROTATE_BEFORE_END_MS = 10_000;
/** Écart entre deux QR (50 s). */
export const ROTATION_PERIOD_MS = TOKEN_LIFE_MS - ROTATE_BEFORE_END_MS;

export type RotationPhase =
  /** QR valable affiché. */
  | 'showing'
  /** Nouveau QR demandé. */
  | 'renewing'
  /** Le dernier renouvellement a échoué ; nouvel essai programmé. */
  | 'retrying'
  /** Le QR a été scanné (ou le partage s'est terminé ailleurs) : plus de rotation. */
  | 'scanned'
  /** Le partage n'existe plus. */
  | 'ended'
  /** Arrêté par l'écran (fermeture, arrêt du partage). */
  | 'stopped';

export type RenewProblem = 'offline' | 'busy' | 'error';

export interface RotationState {
  phase: RotationPhase;
  /** Jeton affiché (contenu du QR). */
  token: string;
  /** Réception du jeton affiché (horloge du téléphone, en ms). */
  receivedAt: number;
  /** Prochaine demande de jeton (horloge du téléphone, en ms). */
  rotateAt: number;
  /** Nombre de QR reçus depuis l'ouverture (1 au départ). */
  generation: number;
  /** Raison du dernier échec, tant qu'on réessaie ; sinon null. */
  problem: RenewProblem | null;
  /** Essais ratés de suite. */
  failures: number;
}

/** Délai avant un nouvel essai après `failures` échecs de suite : 2 s, 4 s, 8 s, puis 15 s. */
export function retryDelayMs(failures: number): number {
  return Math.min(15_000, 2000 * 2 ** Math.max(0, failures - 1));
}

/** Le jeton affiché est-il encore valable ? (estimation prudente, depuis sa réception) */
export function isTokenAlive(state: Pick<RotationState, 'receivedAt'>, now: number): boolean {
  return now < state.receivedAt + TOKEN_LIFE_MS;
}

/** Secondes avant le prochain QR (arrondies au-dessus, jamais négatives). */
export function secondsToNext(state: Pick<RotationState, 'rotateAt'>, now: number): number {
  return Math.max(0, Math.ceil((state.rotateAt - now) / 1000));
}

/** Part du temps écoulée avant le prochain QR, de 0 (nouveau) à 1 (il va changer). */
export function rotationProgress(
  state: Pick<RotationState, 'receivedAt' | 'rotateAt'>,
  now: number,
): number {
  const span = state.rotateAt - state.receivedAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - state.receivedAt) / span));
}

/** Échec d'une rotation ⇒ ce qu'il faut faire. */
export function renewOutcome(error: unknown): 'scanned' | 'ended' | RenewProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 409) return 'scanned';
  if (error.status === 404) return 'ended';
  if (error.status === 0) return 'offline';
  if (error.status === 429 || error.status === 503) return 'busy';
  return 'error';
}

export interface RotatorDeps {
  sessionId: string;
  /** Premier jeton (réponse de POST /shares). */
  first: ShareTokenDto;
  rotate: (sessionId: string) => Promise<ShareTokenDto>;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onChange: (state: RotationState) => void;
}

export interface QrRotator {
  get: () => RotationState;
  /** Retour dans l'application : si l'heure du QR est passée pendant l'absence, on renouvelle tout de suite. */
  resume: () => void;
  /** « Réessayer » : renouvelle tout de suite. */
  retryNow: () => void;
  /** Fermeture de l'écran : plus aucune requête ; une réponse en route est ignorée. */
  stop: () => void;
}

export function createQrRotator(deps: RotatorDeps): QrRotator {
  const start = deps.now();
  let state: RotationState = {
    phase: 'showing',
    token: deps.first.token,
    receivedAt: start,
    rotateAt: start + ROTATION_PERIOD_MS,
    generation: 1,
    problem: null,
    failures: 0,
  };
  let timer: unknown = null;
  let inFlight = false;
  let finished = false;

  const set = (next: Partial<RotationState>) => {
    state = { ...state, ...next };
    deps.onChange(state);
  };
  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const schedule = (at: number) => {
    clear();
    timer = deps.setTimer(
      () => {
        timer = null;
        void renew();
      },
      Math.max(0, at - deps.now()),
    );
  };

  async function renew(): Promise<void> {
    if (finished || inFlight) return;
    clear();
    inFlight = true;
    set({ phase: 'renewing' });
    try {
      const next = await deps.rotate(deps.sessionId);
      if (finished) return;
      const at = deps.now();
      set({
        phase: 'showing',
        token: next.token,
        receivedAt: at,
        rotateAt: at + ROTATION_PERIOD_MS,
        generation: state.generation + 1,
        problem: null,
        failures: 0,
      });
      schedule(state.rotateAt);
    } catch (error) {
      if (finished) return;
      const outcome = renewOutcome(error);
      if (outcome === 'scanned' || outcome === 'ended') {
        finished = true;
        set({ phase: outcome, problem: null });
        return;
      }
      const failures = state.failures + 1;
      const at = deps.now() + retryDelayMs(failures);
      set({ phase: 'retrying', problem: outcome, failures, rotateAt: at });
      schedule(at);
    } finally {
      inFlight = false;
    }
  }

  schedule(state.rotateAt);

  return {
    get: () => state,
    resume() {
      if (finished || inFlight) return;
      if (deps.now() >= state.rotateAt) void renew();
      else schedule(state.rotateAt); // une minuterie a pu être suspendue en arrière-plan
    },
    retryNow() {
      void renew(); // sans effet si le contrôleur est arrêté (vérifié dans renew)
    },
    stop() {
      if (finished) return;
      finished = true;
      clear();
      set({ phase: 'stopped' });
    },
  };
}
