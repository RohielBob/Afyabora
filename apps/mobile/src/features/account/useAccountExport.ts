// Branche la logique de l'export (account.ts) sur le vrai téléphone : réseau, synchronisation, API, fichiers
// et partage. L'écran n'a qu'à appeler `start()` et `shareAgain()`, et lire l'état.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOnline, syncNow, useSyncState } from '@/features/sync';
import { apiFile } from '@/lib/api-client';
import {
  EXPORT_PATH,
  EXPORT_TIMEOUT_MS,
  exportMyData,
  type ExportPhase,
  type ExportProblem,
} from './account';
import { saveExport, shareExport, type SavedExport } from './files';

export type ExportState =
  | { status: 'idle' }
  | { status: 'working'; phase: ExportPhase }
  | { status: 'done'; saved: SavedExport; unsent: number }
  | { status: 'failed'; problem: ExportProblem; saved?: SavedExport; unsent: number };

export function useAccountExport() {
  const { t } = useTranslation();
  const sync = useSyncState();
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  // Valeur lue au moment du clic, pas celle du dernier rendu.
  const pending = useRef(sync.pendingCount);
  pending.current = sync.pendingCount;
  const dialogTitle = t('account.export.shareTitle');

  const start = async () => {
    setState({ status: 'working', phase: 'syncing' });
    const outcome = await exportMyData(
      {
        isOnline,
        pending: () => pending.current,
        syncNow,
        download: () => apiFile(EXPORT_PATH, { timeoutMs: EXPORT_TIMEOUT_MS }),
        save: saveExport,
        share: (saved) => shareExport(saved, dialogTitle),
        now: () => new Date(),
      },
      (phase) => setState({ status: 'working', phase }),
    );
    setState(
      outcome.ok
        ? { status: 'done', saved: outcome.saved, unsent: outcome.unsent }
        : {
            status: 'failed',
            problem: outcome.problem,
            saved: outcome.saved,
            unsent: outcome.unsent ?? 0,
          },
    );
  };

  /** Rouvre le partage du même fichier, sans le redemander au serveur. */
  const shareAgain = async () => {
    const saved = state.status === 'done' || state.status === 'failed' ? state.saved : undefined;
    if (saved) await shareExport(saved, dialogTitle).catch(() => false);
  };

  return { state, pending: sync.pendingCount, start, shareAgain };
}
