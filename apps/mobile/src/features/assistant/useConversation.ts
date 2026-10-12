// Conversation avec l'assistant (L9-09) : relie l'état pur (`conversation.ts`) au réseau.
//  - conversation NEUVE : identifiant créé sur le téléphone, conversation créée sur le serveur au premier
//    envoi seulement (une conversation ouverte puis abandonnée ne laisse rien) ;
//  - conversation EXISTANTE : relue sur le serveur (hors-ligne ⇒ message clair et « Réessayer ») ;
//  - une question à la fois ; en cas d'échec (réseau, quota…), elle reste affichée avec « Réessayer », et
//    le renvoi garde son identifiant (le serveur ne la compte jamais deux fois) ;
//  - réponse « en préparation » (modèle local, L9-07) : relue toutes les 2 à 5 secondes jusqu'à ce qu'elle
//    soit prête ; au-delà de 2 min 30, elle « tarde » et n'est plus relue que toutes les 15 secondes.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError } from '@/lib/api-client';
import { newId } from '@/lib/uuid';
import { assistantApi } from './api';
import {
  LATE_POLL_MS,
  chatReducer,
  failureOf,
  initialState,
  isLate,
  isSending,
  pendingAnswers,
  pollDelay,
  questionProblem,
} from './conversation';

export function useConversation(conversationId: string, existing: boolean) {
  const [state, dispatch] = useReducer(chatReducer, undefined, () =>
    initialState(conversationId, existing),
  );
  // État le plus récent, lu par les tâches en cours (envoi, relecture) sans les relancer.
  const latest = useRef(state);
  latest.current = state;

  const load = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      const detail = await assistantApi.get(conversationId);
      dispatch({ type: 'loaded', messages: detail.messages });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : -1;
      dispatch({
        type: 'loadFailed',
        reason: status === 0 ? 'offline' : status === 404 ? 'notFound' : 'error',
      });
    }
  }, [conversationId]);

  useEffect(() => {
    if (existing) void load();
  }, [existing, load]);

  /** Envoie une question déjà affichée (première fois ou nouvel essai). */
  const deliver = useCallback(
    async (question: { id: string; text: string }) => {
      try {
        if (!latest.current.created) {
          await assistantApi.create(conversationId);
          dispatch({ type: 'created' });
        }
        const response = await assistantApi.send(conversationId, question);
        dispatch({
          type: 'sent',
          questionId: question.id,
          messages: [response.question, response.answer],
        });
      } catch (error) {
        dispatch({ type: 'sendFailed', questionId: question.id, failure: failureOf(error) });
      }
    },
    [conversationId],
  );

  /** Pose une question ; faux si elle est invalide ou si une autre question part déjà. */
  const ask = useCallback(
    (text: string): boolean => {
      if (questionProblem(text) || isSending(latest.current)) return false;
      const question = { id: newId(), text: text.trim(), createdAt: new Date().toISOString() };
      dispatch({ type: 'queued', question });
      void deliver(question);
      return true;
    },
    [deliver],
  );

  /** Renvoie une question échouée : même identifiant, sauf s'il a été refusé comme déjà pris (409). */
  const retry = useCallback(
    (questionId: string) => {
      const question = latest.current.outbox.find((q) => q.id === questionId);
      if (!question || isSending(latest.current)) return;
      const id = question.failure?.kind === 'conflict' ? newId() : question.id;
      dispatch({ type: 'retrying', questionId, ...(id !== question.id ? { newId: id } : {}) });
      void deliver({ id, text: question.text });
    },
    [deliver],
  );

  const discard = useCallback((questionId: string) => {
    dispatch({ type: 'discarded', questionId });
  }, []);

  // Relecture des réponses en préparation (la liste change quand l'une d'elles devient prête).
  const pendingKey = pendingAnswers(state)
    .map((m) => m.id)
    .join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const detail = await assistantApi.get(conversationId);
        if (!cancelled) dispatch({ type: 'refreshed', messages: detail.messages });
      } catch {
        // Pas de réseau pour l'instant : on relira au prochain tour.
      }
      if (cancelled) return;
      attempt += 1;
      const late = pendingAnswers(latest.current).some((m) => isLate(m, Date.now()));
      timer = setTimeout(() => void tick(), late ? LATE_POLL_MS : pollDelay(attempt));
    };
    timer = setTimeout(() => void tick(), pollDelay(0));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingKey, conversationId]);

  return { state, ask, retry, discard, reload: load };
}
