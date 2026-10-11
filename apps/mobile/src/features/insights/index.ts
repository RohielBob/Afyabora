// Point d'entrée public de la feature « insights ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { loadLocalAnalysis, type LocalAnalysis, type LocalSources } from './local-analysis';
export { useLocalAnalysis, type LocalAnalysisState } from './useLocalAnalysis';
export {
  EVIDENCE_PREVIEW,
  crossedThreshold,
  evidenceOf,
  headlineOf,
  insightSentence,
  joinList,
  orderInsights,
  pointsInPeriod,
  summaryText,
  type Headline,
} from './presentation';
export { SummaryCard } from './components/SummaryCard';
export { AnalysisSkeleton } from './components/AnalysisSkeleton';
export { AnalysisSummary } from './components/AnalysisSummary';
export { EvidenceList } from './components/EvidenceList';
export { InsightCard } from './components/InsightCard';
export { InsufficientData } from './components/InsufficientData';
