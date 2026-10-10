// Point d'entrée public de la feature « dashboard ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { ageOf, dayLabel, greetingKey, type Age, type DayLabel } from './latest';
export {
  CHART_PERIODS,
  DEFAULT_PERIOD,
  periodBounds,
  pointsIn,
  type ChartPeriod,
  type ChartPoint,
} from './chart';
export { useDashboard, type DashboardState } from './useDashboard';
export { DashboardSkeleton } from './components/DashboardSkeleton';
export { EmptyLatest } from './components/EmptyLatest';
export { GlucoseChart } from './components/GlucoseChart';
export { LatestReading } from './components/LatestReading';
export { SyncStatus } from './components/SyncStatus';
