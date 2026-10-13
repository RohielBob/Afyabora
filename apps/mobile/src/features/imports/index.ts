// Point d'entrée public de la feature « imports ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { PREVIEW_TIMEOUT_MS, buildPreviewForm, importsApi, type FormLike } from './api';
export { importFlow, useImportFlow, type ImportFlow } from './flow';
export {
  COLUMN_ROLES,
  assignColumn,
  keepKnownColumns,
  mappingIssues,
  toMapping,
  type ColumnRole,
  type MappingDraft,
  type MappingIssue,
} from './mapping';
export {
  IMPORT_PICKER_TYPES,
  UNIT_EXAMPLES,
  checkFile,
  fileSize,
  previewProblem,
  type FileCheck,
  type FileKind,
  type FileProblem,
  type PickedFile,
  type PreviewProblem,
} from './start';
export {
  REPORT_GROUPS,
  ROWS_PAGE,
  allowedActions,
  buildDecisions,
  checkCorrection,
  chooseForAll,
  commitProblem,
  groupRows,
  importCount,
  pageOf,
  type Choices,
  type CommitProblem,
  type CorrectionProblem,
  type ReportGroup,
  type RowAction,
  type RowChoice,
} from './report';
export { BackButton } from './components/BackButton';
export { ColumnRoleChoice, NO_COLUMN } from './components/ColumnRoleChoice';
export { FilePickerCard, useFileSizeLabel } from './components/FilePickerCard';
export { Note, ProblemAlert } from './components/ImportMessages';
export { ReportRowCard } from './components/ReportRowCard';
export { ReportSummary } from './components/ReportSummary';
export { StepTitle } from './components/StepTitle';
