// Branche la logique du rapport (report.ts) sur le vrai téléphone : réseau, synchronisation, API, fichiers
// et partage. L'écran n'a qu'à appeler `create(jours)` et `shareAgain()`, et lire l'état.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOnline, syncNow, useSyncState } from '@/features/sync';
import { apiFile } from '@/lib/api-client';
import { saveReport, shareReport, type SavedReport } from './files';
import {
  REPORT_TIMEOUT_MS,
  createReport,
  reportPath,
  type ReportPeriod,
  type ReportPhase,
  type ReportProblem,
} from './report';

export type ReportState =
  | { status: 'idle' }
  | { status: 'working'; phase: ReportPhase }
  | { status: 'done'; saved: SavedReport; unsent: number }
  | { status: 'failed'; problem: ReportProblem; saved?: SavedReport; unsent: number };

export function useReport() {
  const { t } = useTranslation();
  const sync = useSyncState();
  const [state, setState] = useState<ReportState>({ status: 'idle' });
  // Valeur lue au moment du clic, pas celle du dernier rendu.
  const pending = useRef(sync.pendingMeasurements);
  pending.current = sync.pendingMeasurements;
  const dialogTitle = t('report.shareTitle');

  const create = async (days: ReportPeriod) => {
    setState({ status: 'working', phase: 'syncing' });
    const outcome = await createReport(
      days,
      {
        isOnline,
        pendingMeasurements: () => pending.current,
        syncNow,
        download: (period) => apiFile(reportPath(period), { timeoutMs: REPORT_TIMEOUT_MS }),
        save: saveReport,
        share: (saved) => shareReport(saved, dialogTitle),
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

  /** Rouvre le partage du même fichier (envoyer aussi par e-mail…), sans recréer le rapport. */
  const shareAgain = async () => {
    if (state.status !== 'done') return;
    await shareReport(state.saved, dialogTitle).catch(() => false);
  };

  return {
    state,
    pendingMeasurements: sync.pendingMeasurements,
    create,
    shareAgain,
    reset: () => setState({ status: 'idle' }),
  };
}
