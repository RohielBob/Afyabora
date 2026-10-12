// Interface `LlmProvider` (L3-05, ADR-0005) : un modèle de langage qui ne fait que METTRE EN MOTS les
// observations du moteur @glyka/analytics. Il ne calcule rien, ne décide rien : s'il est absent, lent, en
// panne ou s'il répond mal, les gabarits français du moteur sont utilisés (la démo n'en dépend jamais).
// Changer de fournisseur = écrire une autre implémentation de cette interface, rien d'autre.

/** Jeton d'injection NestJS : le fournisseur choisi par la configuration, ou `null` (aucun modèle). */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmRequest {
  /** Consignes (rôle, règles absolues, format de réponse). */
  system: string;
  /** Les phrases à reformuler : uniquement des faits agrégés, sans nom, email ni identifiant. */
  prompt: string;
  /**
   * Arrêt demandé par l'appelant (L9-07 : délai de 2 minutes d'une réponse de l'assistant), en plus du
   * délai propre au fournisseur. Un arrêt lève LlmError('timeout').
   */
  signal?: AbortSignal;
}

export interface LlmProvider {
  /** Nom court pour les journaux (« ollama »). */
  readonly name: string;
  /** Modèle utilisé (« llama3.1 »), pour les journaux et le cache. */
  readonly model: string;
  /** Texte brut renvoyé par le modèle (JSON attendu). Lève LlmError en cas d'échec. */
  generate(request: LlmRequest): Promise<string>;
}

/** Pourquoi le modèle n'a pas répondu : écrit dans les journaux, jamais avec une donnée de santé. */
export type LlmFailure = 'timeout' | 'unreachable' | 'http' | 'format';

export class LlmError extends Error {
  constructor(
    readonly reason: LlmFailure,
    detail?: string,
  ) {
    super(detail ? `${reason} : ${detail}` : reason);
    this.name = 'LlmError';
  }
}
