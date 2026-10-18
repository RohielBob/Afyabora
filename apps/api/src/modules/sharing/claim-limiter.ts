// Blocage après des scans ratés (L5-03, README du module : « ≥ 5 échecs/min/IP : blocage »).
// Un jeton fait 32 octets : le deviner est impossible en pratique. Ce blocage sert surtout à arrêter tôt un
// outil qui essaie des jetons à la chaîne, et à ne pas laisser un compte médecin servir à cela.
//  - Seuls les ÉCHECS comptent (QR invalide, expiré, déjà utilisé) : un médecin qui scanne ses patients
//    toute la journée n'est jamais bloqué.
//  - Deux compteurs : par adresse IP ET par compte médecin. 5 échecs en 60 s sur l'un des deux ⇒ 429, avec
//    le délai d'attente (`retryAfterSeconds` et l'en-tête Retry-After), MÊME avec un bon jeton : le scan
//    n'est pas tenté, le jeton du patient n'est donc pas consommé.
//  - Chaque essai est compté comme un échec DÈS SON DÉBUT, puis pardonné s'il réussit : 50 essais lancés en
//    même temps ne passent pas tous le contrôle avant que le premier échec soit enregistré.
//  - Fenêtre glissante : chaque échec est oublié 60 s après. Mémoire du processus : suffisant pour le MVP
//    (une seule instance de l'API) ; à déplacer dans une base partagée si l'API tourne sur plusieurs machines.
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const CLAIM_MAX_FAILURES = 5;
export const CLAIM_FAILURE_WINDOW_MS = 60_000;
/** Au-delà, on purge les compteurs vides (protège la mémoire si beaucoup d'adresses différentes échouent). */
const SWEEP_ABOVE = 10_000;

export const CLAIM_BLOCKED_MESSAGE =
  'Trop de QR invalides scannés. Patientez une minute avant de réessayer.';

@Injectable()
export class ClaimFailureLimiter {
  /** Clé (« ip:… » ou « doctor:… ») ⇒ dates des échecs récents, du plus ancien au plus récent. */
  private readonly failures = new Map<string, number[]>();

  /**
   * Début d'un scan : 429 si l'une des clés a atteint la limite ; sinon l'essai est compté comme un échec.
   * Renvoie la fonction à appeler si le scan RÉUSSIT (l'essai est alors oublié).
   */
  begin(keys: string[], now: Date): () => void {
    this.assertAllowed(keys, now);
    this.recordFailure(keys, now);
    return () => this.forgive(keys, now);
  }

  /** 429 si l'une des clés a atteint la limite ; sinon rien. */
  private assertAllowed(keys: string[], now: Date): void {
    let waitMs = 0;
    for (const key of keys) {
      const recent = this.recent(key, now);
      if (recent.length >= CLAIM_MAX_FAILURES) {
        // Débloqué quand assez d'échecs sont sortis de la fenêtre pour repasser sous la limite.
        const releasingFailure = recent[recent.length - CLAIM_MAX_FAILURES] as number;
        waitMs = Math.max(waitMs, releasingFailure + CLAIM_FAILURE_WINDOW_MS - now.getTime());
      }
    }
    if (waitMs > 0) {
      throw new HttpException(
        {
          message: CLAIM_BLOCKED_MESSAGE,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          // waitMs > 0 : arrondi à la seconde SUPÉRIEURE, donc au moins 1 s.
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Un essai : compté pour chacune des clés. */
  private recordFailure(keys: string[], now: Date): void {
    if (this.failures.size > SWEEP_ABOVE) this.sweep(now);
    for (const key of keys) {
      this.failures.set(key, [...this.recent(key, now), now.getTime()]);
    }
  }

  /** Scan réussi : on retire UN essai daté de `at` pour chaque clé. */
  private forgive(keys: string[], at: Date): void {
    for (const key of keys) {
      const list = this.failures.get(key);
      const index = list?.indexOf(at.getTime()) ?? -1;
      if (!list || index < 0) continue;
      list.splice(index, 1);
      if (list.length === 0) this.failures.delete(key);
    }
  }

  /** Échecs encore dans la fenêtre (les plus anciens sont oubliés au passage). */
  private recent(key: string, now: Date): number[] {
    const since = now.getTime() - CLAIM_FAILURE_WINDOW_MS;
    const kept = (this.failures.get(key) ?? []).filter((at) => at > since);
    if (kept.length === 0) this.failures.delete(key);
    else this.failures.set(key, kept);
    return kept;
  }

  private sweep(now: Date): void {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
  }
}
