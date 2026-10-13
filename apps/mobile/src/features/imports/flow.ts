// Parcours d'import en cours, partagé par ses 3 écrans (fichier → colonnes → rapport). Gardé en MÉMOIRE
// seulement : rien n'est écrit sur le téléphone (les valeurs restent sur le serveur, dans le lot
// « aperçu »). Quitter l'app efface le parcours, et c'est voulu.
import { useSyncExternalStore } from 'react';
import type { GlucoseUnit, ImportReport } from '@glyka/shared';
import { keepKnownColumns, type MappingDraft } from './mapping';
import type { PickedFile } from './start';

export interface ImportFlow {
  file: PickedFile | null;
  /** Unité des valeurs du fichier quand une ligne ne la donne pas. */
  unit: GlucoseUnit;
  /** Rapport de la dernière analyse (écran L4-07). */
  report: ImportReport | null;
  /** Colonnes du fichier, quand le serveur ne les a pas reconnues (L4-06) ; sinon null. */
  columns: string[] | null;
  /** Colonnes choisies par le patient (L4-06), gardées si l'on revient sur l'écran. */
  draft: MappingDraft;
}

let state: ImportFlow = { file: null, unit: 'G_L', report: null, columns: null, draft: {} };
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
    emit({ file: null, unit, report: null, columns: null, draft: {} });
  },
  /** Autre fichier : l'ancien rapport et les colonnes choisies ne valent plus. */
  chooseFile(file: PickedFile | null) {
    emit({ ...state, file, report: null, columns: null, draft: {} });
  },
  /** Autre unité : l'ancien rapport ne vaut plus. */
  chooseUnit(unit: GlucoseUnit) {
    if (unit !== state.unit) emit({ ...state, unit, report: null });
  },
  analysed(report: ImportReport) {
    emit({ ...state, report });
  },
  /**
   * Le serveur ne reconnaît pas les colonnes : il donne celles du fichier. Les choix déjà faits qui
   * existent encore sont gardés (une nouvelle liste peut arriver après un choix refusé).
   */
  needColumns(columns: string[]) {
    emit({ ...state, report: null, columns, draft: keepKnownColumns(state.draft, columns) });
  },
  /** Choix du patient en cours (écran des colonnes). */
  chooseColumns(draft: MappingDraft) {
    emit({ ...state, draft });
  },
};

/** Le parcours, relu à chaque changement (pour les écrans). */
export function useImportFlow(): ImportFlow {
  return useSyncExternalStore(importFlow.subscribe, importFlow.get, importFlow.get);
}
