// Créneaux horaires : matin, midi, soir, nuit (heure locale du patient).
import type { GlucosePoint } from './types';

export type TimeSlot = 'MORNING' | 'NOON' | 'EVENING' | 'NIGHT';

export function slotOf(at: number, tzOffsetMinutes = 60): TimeSlot {
  const hour = new Date(at + tzOffsetMinutes * 60_000).getUTCHours();
  if (hour >= 5 && hour < 11) return 'MORNING';
  if (hour >= 11 && hour < 16) return 'NOON';
  if (hour >= 16 && hour < 22) return 'EVENING';
  return 'NIGHT';
}

export function groupBySlot(points: GlucosePoint[], tzOffsetMinutes = 60): Record<TimeSlot, GlucosePoint[]> {
  const out: Record<TimeSlot, GlucosePoint[]> = { MORNING: [], NOON: [], EVENING: [], NIGHT: [] };
  for (const p of points) out[slotOf(p.at, tzOffsetMinutes)].push(p);
  return out;
}
