// Tests du ticket L9-09 : état de la conversation avec l'assistant (fonctions pures, sans écran).
import type { AssistantMessageDto } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import {
  LATE_AFTER_MS,
  POLL_DELAYS_MS,
  chatReducer,
  failureOf,
  initialState,
  isLate,
  isSending,
  mergeMessages,
  pendingAnswers,
  pollDelay,
  questionProblem,
  showCounter,
  type ChatState,
} from '../conversation';

const CONV = '7d8e2c1a-1111-4aaa-8bbb-000000000001';
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 12, 8, 0, seconds)).toISOString();

function message(overrides: Partial<AssistantMessageDto> & { id: string }): AssistantMessageDto {
  return {
    conversationId: CONV,
    role: 'ASSISTANT',
    status: 'READY',
    kind: 'SHEET',
    text: 'Réponse.',
    sources: [],
    rephrased: false,
    createdAt: at(0),
    ...overrides,
  };
}
const question = (id: string, seconds: number, text = 'Question ?') =>
  message({ id, role: 'USER', kind: null, text, createdAt: at(seconds) });

describe('état initial', () => {
  it('nouvelle conversation : prête tout de suite, pas encore créée sur le serveur', () => {
    expect(initialState(CONV, false)).toEqual({
      conversationId: CONV,
      created: false,
      load: 'ready',
      messages: [],
      outbox: [],
    });
  });

  it('conversation existante : à charger, déjà créée', () => {
    expect(initialState(CONV, true)).toMatchObject({ created: true, load: 'loading' });
  });
});

describe('messages du serveur : fusion et ordre', () => {
  it('ordre par date ; à la même milliseconde, la question avant sa réponse', () => {
    const answer = message({ id: 'a1', createdAt: at(5) });
    const q = question('q1', 5);
    const older = question('q0', 1);
    expect(mergeMessages([], [answer, q, older]).map((m) => m.id)).toEqual(['q0', 'q1', 'a1']);
  });

  it('même identifiant : la version la plus récente du serveur remplace l’ancienne', () => {
    const pending = message({ id: 'a1', status: 'PENDING', kind: null, text: null });
    const ready = message({ id: 'a1', text: 'Prête.', rephrased: true });
    const merged = mergeMessages([question('q1', 0), pending], [ready]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual(ready);
  });
});

describe('réducteur', () => {
  const base = initialState(CONV, false);

  it('chargement : en cours, réussi (messages triés), échoué (raison gardée)', () => {
    const loading = chatReducer(initialState(CONV, true), { type: 'loadStarted' });
    expect(loading.load).toBe('loading');
    const loaded = chatReducer(loading, {
      type: 'loaded',
      messages: [message({ id: 'a1', createdAt: at(2) }), question('q1', 1)],
    });
    expect(loaded.load).toBe('ready');
    expect(loaded.messages.map((m) => m.id)).toEqual(['q1', 'a1']);
    for (const reason of ['offline', 'notFound', 'error'] as const) {
      expect(chatReducer(loading, { type: 'loadFailed', reason }).load).toBe(reason);
    }
  });

  it('question envoyée : visible « en cours », puis remplacée par la question et la réponse du serveur', () => {
    const queued = chatReducer(base, {
      type: 'queued',
      question: { id: 'q1', text: 'Ma semaine ?', createdAt: at(0) },
    });
    expect(queued.outbox).toEqual([
      { id: 'q1', text: 'Ma semaine ?', createdAt: at(0), status: 'sending' },
    ]);
    expect(isSending(queued)).toBe(true);

    const sent = chatReducer(queued, {
      type: 'sent',
      questionId: 'q1',
      messages: [question('q1', 0, 'Ma semaine ?'), message({ id: 'a1', createdAt: at(0) })],
    });
    expect(sent.outbox).toEqual([]);
    expect(sent.created).toBe(true);
    expect(sent.messages.map((m) => m.id)).toEqual(['q1', 'a1']);
    expect(isSending(sent)).toBe(false);
  });

  it('échec : la question reste avec sa raison ; nouvel essai avec le même identifiant, ou un nouveau', () => {
    const queued = chatReducer(base, {
      type: 'queued',
      question: { id: 'q1', text: 'Ma semaine ?', createdAt: at(0) },
    });
    const failed = chatReducer(queued, {
      type: 'sendFailed',
      questionId: 'q1',
      failure: { kind: 'offline' },
    });
    expect(failed.outbox[0]).toMatchObject({
      id: 'q1',
      status: 'failed',
      failure: { kind: 'offline' },
    });
    expect(isSending(failed)).toBe(false);

    const again = chatReducer(failed, { type: 'retrying', questionId: 'q1' });
    expect(again.outbox[0]).toEqual({
      id: 'q1',
      text: 'Ma semaine ?',
      createdAt: at(0),
      status: 'sending',
    });
    const renamed = chatReducer(failed, { type: 'retrying', questionId: 'q1', newId: 'q2' });
    expect(renamed.outbox[0]).toMatchObject({ id: 'q2', status: 'sending' });
    expect(renamed.outbox[0]).not.toHaveProperty('failure');
  });

  it('retirer une question non envoyée', () => {
    const queued = chatReducer(base, {
      type: 'queued',
      question: { id: 'q1', text: 'Ma semaine ?', createdAt: at(0) },
    });
    expect(chatReducer(queued, { type: 'discarded', questionId: 'q1' }).outbox).toEqual([]);
  });

  it('seule une RÉPONSE peut être « en préparation » (une question reçue est toujours prête)', () => {
    const odd = { ...question('q1', 0), status: 'PENDING' as const };
    expect(pendingAnswers({ ...base, messages: [odd] })).toEqual([]);
  });

  it('création sur le serveur, puis relecture des réponses en préparation', () => {
    const created = chatReducer(base, { type: 'created' });
    expect(created.created).toBe(true);
    const pending = message({ id: 'a1', status: 'PENDING', kind: null, text: null });
    const withPending: ChatState = { ...created, messages: [question('q1', 0), pending] };
    expect(pendingAnswers(withPending).map((m) => m.id)).toEqual(['a1']);
    const refreshed = chatReducer(withPending, {
      type: 'refreshed',
      messages: [question('q1', 0), message({ id: 'a1', rephrased: true })],
    });
    expect(pendingAnswers(refreshed)).toEqual([]);
    expect(refreshed.messages[1]).toMatchObject({ status: 'READY', rephrased: true });
  });
});

describe('saisie', () => {
  it('même règle que le serveur : 2 à 500 caractères, espaces ignorés', () => {
    expect(questionProblem('')).toBe('empty');
    expect(questionProblem('   ')).toBe('empty');
    expect(questionProblem(' a ')).toBe('tooShort');
    expect(questionProblem('ok')).toBeNull();
    expect(questionProblem('x'.repeat(500))).toBeNull();
    expect(questionProblem(` ${'x'.repeat(500)} `)).toBeNull();
    expect(questionProblem('x'.repeat(501))).toBe('tooLong');
  });

  it('compteur à partir de 80 % de la limite (400 caractères)', () => {
    expect(showCounter('x'.repeat(399))).toBe(false);
    expect(showCounter('x'.repeat(400))).toBe(true);
  });
});

describe('erreurs d’envoi', () => {
  it('réseau, quota (avec délai), identifiant déjà pris, autre', () => {
    expect(failureOf(new ApiError(0, 'Serveur injoignable'))).toEqual({ kind: 'offline' });
    expect(failureOf(new ApiError(429, 'Trop', { retryAfterSeconds: 1800 }))).toEqual({
      kind: 'quota',
      retryAfterSeconds: 1800,
    });
    expect(failureOf(new ApiError(429, 'Trop'))).toEqual({ kind: 'quota', retryAfterSeconds: 60 });
    expect(failureOf(new ApiError(409, 'Pris', { code: 'MESSAGE_ID_CONFLICT' }))).toEqual({
      kind: 'conflict',
    });
    expect(failureOf(new ApiError(409, 'Autre'))).toEqual({ kind: 'unknown' });
    expect(failureOf(new ApiError(500, 'Erreur'))).toEqual({ kind: 'unknown' });
    expect(failureOf(new Error('autre'))).toEqual({ kind: 'unknown' });
  });
});

describe('relecture des réponses en préparation', () => {
  it('2 s, puis 3 s, puis toutes les 5 s', () => {
    expect([0, 1, 2, 3, 10].map(pollDelay)).toEqual([2_000, 3_000, 5_000, 5_000, 5_000]);
    expect(POLL_DELAYS_MS).toEqual([2_000, 3_000, 5_000]);
  });

  it('une réponse « tarde » au-delà de 2 min 30 (le serveur garantit 2 min)', () => {
    const pending = message({
      id: 'a1',
      status: 'PENDING',
      kind: null,
      text: null,
      createdAt: at(0),
    });
    const t0 = Date.parse(at(0));
    expect(isLate(pending, t0 + LATE_AFTER_MS)).toBe(false);
    expect(isLate(pending, t0 + LATE_AFTER_MS + 1)).toBe(true);
    expect(isLate({ ...pending, status: 'READY' }, t0 + LATE_AFTER_MS + 1)).toBe(false);
  });
});
