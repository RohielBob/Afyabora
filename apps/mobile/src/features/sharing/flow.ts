// Partage en cours, transmis de l'écran du choix (L5-06) à celui du QR (L5-07). Gardé en MÉMOIRE seulement :
// le jeton du QR n'est jamais écrit sur le téléphone (il ne vaut que 60 s et sert une fois). Quitter l'app
// efface le partage en cours ; le patient en crée un nouveau, ce qui remplace l'ancien côté serveur.
import { useSyncExternalStore } from 'react';
import type { CreateShareResponse } from '@glyka/shared';

let current: CreateShareResponse | null = null;
const listeners = new Set<() => void>();

function emit(next: CreateShareResponse | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

export const shareFlow = {
  get: (): CreateShareResponse | null => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Session créée (POST /shares) : l'écran du QR la reprend. */
  created(share: CreateShareResponse) {
    emit(share);
  },
  clear() {
    emit(null);
  },
};

/** Partage en cours, pour un écran React. */
export function useShareFlow(): CreateShareResponse | null {
  return useSyncExternalStore(shareFlow.subscribe, shareFlow.get, shareFlow.get);
}
