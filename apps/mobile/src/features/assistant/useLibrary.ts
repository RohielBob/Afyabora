// Liste des conversations et fiches de connaissances (L9-10) : chargement depuis le serveur, seule source
// (rien n'est gardé sur le téléphone). Hors-ligne : état « offline » et « Réessayer » à l'écran.
import type {
  AssistantConversationDto,
  KnowledgeSheet,
  KnowledgeSheetSummary,
} from '@glyka/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { assistantApi } from './api';
import { mergePage } from './library';

/** État d'un chargement. */
export type LoadStatus = 'loading' | 'ready' | 'offline' | 'notFound' | 'error';

const statusOf = (error: unknown): Exclude<LoadStatus, 'loading' | 'ready'> => {
  const status = error instanceof ApiError ? error.status : -1;
  return status === 0 ? 'offline' : status === 404 ? 'notFound' : 'error';
};

/** Résultat d'un effacement : fait, ou pourquoi il a échoué. */
export type RemoveResult = 'done' | 'offline' | 'error';

/**
 * Mes conversations, la plus récemment utilisée d'abord, 20 par page. Relues à chaque retour sur l'écran
 * (une conversation vient peut-être d'être commencée ou poursuivie).
 */
export function useConversationList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<AssistantConversationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Une lecture plus ancienne n'écrase jamais la plus récente.
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const page = await assistantApi.list();
      if (mine !== generation.current) return;
      setItems(mergePage([], page.items));
      setNextCursor(page.nextCursor);
      setStatus('ready');
    } catch (error) {
      if (mine === generation.current) setStatus(statusOf(error));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await assistantApi.list(nextCursor);
      setItems((current) => mergePage(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      // Pas de réseau : le bouton « Voir plus » reste là pour réessayer.
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  /** Efface une conversation ; déjà effacée (404) compte comme faite. */
  const remove = useCallback(async (id: string): Promise<RemoveResult> => {
    try {
      await assistantApi.remove(id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        return statusOf(error) === 'offline' ? 'offline' : 'error';
      }
    }
    setItems((current) => current.filter((c) => c.id !== id));
    return 'done';
  }, []);

  const removeAll = useCallback(async (): Promise<RemoveResult> => {
    try {
      await assistantApi.removeAll();
    } catch (error) {
      return statusOf(error) === 'offline' ? 'offline' : 'error';
    }
    generation.current += 1; // une lecture en cours ne fait pas réapparaître ce qui vient d'être effacé
    setItems([]);
    setNextCursor(null);
    return 'done';
  }, []);

  return { status, items, nextCursor, loadingMore, reload, loadMore, remove, removeAll };
}

/** Les fiches servies (liste, sans le texte). */
export function useSheetList() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<KnowledgeSheetSummary[]>([]);
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setItems((await assistantApi.sheets()).items);
      setStatus('ready');
    } catch (error) {
      setStatus(statusOf(error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { status, items, reload: load };
}

/** Une fiche complète. */
export function useSheet(id: string) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [sheet, setSheet] = useState<KnowledgeSheet | null>(null);
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setSheet(await assistantApi.sheet(id));
      setStatus('ready');
    } catch (error) {
      setStatus(statusOf(error));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  return { status, sheet, reload: load };
}
