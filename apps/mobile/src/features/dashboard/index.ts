// Point d'entrée public de la feature « dashboard ». Exporter ici uniquement ce que les autres features peuvent utiliser.
export { ageOf, dayLabel, greetingKey, type Age, type DayLabel } from './latest';
export { useDashboard, type DashboardState } from './useDashboard';
export { DashboardSkeleton } from './components/DashboardSkeleton';
export { EmptyLatest } from './components/EmptyLatest';
export { LatestReading } from './components/LatestReading';
export { SyncStatus } from './components/SyncStatus';
