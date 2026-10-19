// Point d'entrée public de la feature « report ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  REPORT_TIMEOUT_MS,
  createReport,
  filenameOf,
  isPdf,
  localFilename,
  reportPath,
  reportProblem,
  type ReportDeps,
  type ReportOutcome,
  type ReportPeriod,
  type ReportPhase,
  type ReportProblem,
} from './report';
export { clearReportFiles, type SavedReport } from './files';
export { useReport, type ReportState } from './useReport';
export { ReportContents } from './components/ReportContents';
export { ReportEntryCard } from './components/ReportEntryCard';
