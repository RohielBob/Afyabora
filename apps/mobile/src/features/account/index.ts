// Point d'entrée public de la feature « account » (L1-14 : exporter mes données, supprimer mon compte).
export {
  EXPORT_PATH,
  canConfirmDeletion,
  deleteProblem,
  exportFilename,
  exportMyData,
  exportProblem,
  isExport,
  type DeleteProblem,
  type ExportDeps,
  type ExportOutcome,
  type ExportPhase,
  type ExportProblem,
} from './account';
export { clearExportFiles, type SavedExport } from './files';
export { useAccountExport, type ExportState } from './useAccountExport';
