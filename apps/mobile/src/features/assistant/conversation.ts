// État d'une conversation avec l'assistant « Afyabora » (L9-09) : fonctions PURES, testées sans écran
// (__tests__/conversation.test.ts). Le hook `useConversation` les relie au réseau.
//
// Le SERVEUR est la seule source de vérité des messages : la conversation est chiffrée chez lui et effaçable
// (L9-05) ; le téléphone n'en garde AUCUNE copie (donnée de santé). Seules les questions pas encore reçues
// par le serveur vivent ici (`outbox`) : en cours d'envoi, ou échouées (pas de réseau, quota…), avec leur
// identifiant, pour être renvoyées sans doublon (rejeu idempotent, L9-05).
import { ASSISTANT_QUESTION_MAX_LENGTH, type AssistantMessageDto } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';

/** Pourquoi une question n'a pas pu être envoyée (affiché au patient, avec « Réessayer »). */
export type SendFailure =
  | { kind: 'offline' }
  | { kind: 'quota'; retryAfterSeconds: number }
  | { kind: 'conflict' }
  | { kind: 'unknown' };

/** Question pas encore reçue par le serveur. */
export interface OutgoingQuestion {
  id: string;
  text: string;
  status: 'sending' | 'failed';
  failure?: SendFailure;
  createdAt: string;
}

/** Chargement d'une conversation existante (une nouvelle conversation est prête tout de suite). */
export type LoadState = 'ready' | 'loading' | 'offline' | 'notFound' | 'error';

export interface ChatState {
  conversationId: string;
  /** Vrai une fois la conversation créée sur le serveur (ou relue) : sinon, créée au premier envoi. */
  created: boolean;
  load: LoadState;
  /** Messages connus du serveur, du plus ancien au plus récent. */
  messages: AssistantMessageDto[];
  outbox: OutgoingQuestion[];
}

export type ChatAction =
  | { type: 'loadStarted' }
  | { type: 'loaded'; messages: AssistantMessageDto[] }
  | { type: 'loadFailed'; reason: Exclude<LoadState, 'ready' | 'loading'> }
  | { type: 'created' }
  | { type: 'queued'; question: { id: string; text: string; createdAt: string } }
  | { type: 'sent'; questionId: string; messages: AssistantMessageDto[] }
  | { type: 'sendFailed'; questionId: string; failure: SendFailure }
  | { type: 'retrying'; questionId: string; newId?: string }
  | { type: 'discarded'; questionId: string }
  | { type: 'refreshed'; messages: AssistantMessageDto[] };

/** Conversation neuve (identifiant créé sur le téléphone) ou existante (à charger). */
export function initialState(conversationId: string, existing: boolean): ChatState {
  return {
    conversationId,
    created: existing,
    load: existing ? 'loading' : 'ready',
    messages: [],
    outbox: [],
  };
}

/** Ordre d'affichage : date, puis la question avant sa réponse (même milliseconde possible). */
function byTime(a: AssistantMessageDto, b: AssistantMessageDto): number {
  const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (delta !== 0) return delta;
  return a.role === b.role ? 0 : a.role === 'USER' ? -1 : 1;
}

/** Ajoute ou remplace des messages (même identifiant ⇒ la version la plus récente du serveur gagne). */
export function mergeMessages(
  current: readonly AssistantMessageDto[],
  incoming: readonly AssistantMessageDto[],
): AssistantMessageDto[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(byTime);
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'loadStarted':
      return { ...state, load: 'loading' };
    case 'loaded':
      // Conversation existante : déjà « créée » dès l'état initial (`initialState(…, true)`).
      return { ...state, load: 'ready', messages: mergeMessages([], action.messages) };
    case 'loadFailed':
      return { ...state, load: action.reason };
    case 'created':
      return { ...state, created: true };
    case 'queued':
      return {
        ...state,
        outbox: [...state.outbox, { ...action.question, status: 'sending' }],
      };
    case 'sent':
      return {
        ...state,
        created: true,
        messages: mergeMessages(state.messages, action.messages),
        outbox: state.outbox.filter((q) => q.id !== action.questionId),
      };
    case 'sendFailed':
      return {
        ...state,
        outbox: state.outbox.map((q) =>
          q.id === action.questionId ? { ...q, status: 'failed', failure: action.failure } : q,
        ),
      };
    case 'retrying':
      return {
        ...state,
        outbox: state.outbox.map((q) =>
          q.id === action.questionId
            ? { id: action.newId ?? q.id, text: q.text, createdAt: q.createdAt, status: 'sending' }
            : q,
        ),
      };
    case 'discarded':
      return { ...state, outbox: state.outbox.filter((q) => q.id !== action.questionId) };
    case 'refreshed':
      return { ...state, messages: mergeMessages(state.messages, action.messages) };
  }
}

/** Vrai pendant l'envoi d'une question : on n'en envoie qu'une à la fois. */
export function isSending(state: ChatState): boolean {
  return state.outbox.some((q) => q.status === 'sending');
}

/** Réponses encore « en préparation » (mise en mots par le modèle local, L9-07). */
export function pendingAnswers(state: ChatState): AssistantMessageDto[] {
  return state.messages.filter((m) => m.role === 'ASSISTANT' && m.status === 'PENDING');
}

/** Problème de saisie, ou null si la question peut partir (même règle que le serveur : 2 à 500 caractères). */
export type QuestionProblem = 'empty' | 'tooShort' | 'tooLong';
export function questionProblem(text: string): QuestionProblem | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'empty';
  if (trimmed.length < 2) return 'tooShort';
  if (trimmed.length > ASSISTANT_QUESTION_MAX_LENGTH) return 'tooLong';
  return null;
}

/** Le compteur de caractères s'affiche à l'approche de la limite (80 %). */
export function showCounter(text: string): boolean {
  return text.trim().length >= ASSISTANT_QUESTION_MAX_LENGTH * 0.8;
}

/** Traduit une erreur d'envoi en raison montrée au patient. */
export function failureOf(error: unknown): SendFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown' };
  if (error.status === 0) return { kind: 'offline' };
  if (error.status === 429)
    return { kind: 'quota', retryAfterSeconds: error.retryAfterSeconds ?? 60 };
  if (error.status === 409 && error.code === 'MESSAGE_ID_CONFLICT') return { kind: 'conflict' };
  return { kind: 'unknown' };
}

/**
 * Relecture d'une réponse en préparation : vite au début (le gabarit peut être prêt en quelques secondes),
 * puis toutes les 5 secondes. Le serveur garantit une réponse en 2 minutes au plus (L9-07).
 */
export const POLL_DELAYS_MS = [2_000, 3_000, 5_000] as const;
export function pollDelay(attempt: number): number {
  return POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] as number;
}

/** Au-delà, la réponse « tarde » : on le dit au patient (et on continue de relire, plus lentement). */
export const LATE_AFTER_MS = 150_000;
export const LATE_POLL_MS = 15_000;
export function isLate(answer: AssistantMessageDto, now: number): boolean {
  return answer.status === 'PENDING' && now - Date.parse(answer.createdAt) > LATE_AFTER_MS;
}
