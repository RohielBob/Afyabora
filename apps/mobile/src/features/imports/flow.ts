// Parcours d'import en cours, partagé par ses 3 écrans (fichier → colonnes → rapport). Gardé en MÉMOIRE
// seulement : rien n'est écrit sur le téléphone (les valeurs restent sur le serveur, dans le lot
// « aperçu »). Quitter l'app efface le parcours, et c'est voulu.
import { useSyncExternalStore } from 'react';
import type { GlucoseUnit, ImportReport } from '@glyka/shared';
import type { PickedFile } from './start';

export interface ImportFlow {
  file: PickedFile | null;
  /** Unité des valeurs du fichier quand une ligne ne la donne pas. */
  unit: GlucoseUnit;
  /** Rapport de la dernière analyse (écran L4-07). */
  report: ImportReport | null;
}

let state: ImportFlow = { file: null, unit: 'G_L', report: null };
const listeners = new Set<() => void>();

function emit(next: ImportFlow) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const importFlow = {
  get: (): ImportFlow => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Nouveau parcours : unité de départ = l'unité préférée du patient. */
  start(unit: GlucoseUnit) {
    emit({ file: null, unit, report: null });
  },
  /** Autre fichier : l'ancien rapport ne vaut plus. */
  chooseFile(file: PickedFile | null) {
    emit({ ...state, file, report: null });
  },
  /** Autre unité : l'ancien rapport ne vaut plus. */
  chooseUnit(unit: GlucoseUnit) {
    if (unit !== state.unit) emit({ ...state, unit, report: null });
  },
  analysed(report: ImportReport) {
    emit({ ...state, report });
  },
};

/** Le parcours, relu à chaque changement (pour les écrans). */
export function useImportFlow(): ImportFlow {
  return useSyncExternalStore(importFlow.subscribe, importFlow.get, importFlow.get);
}
