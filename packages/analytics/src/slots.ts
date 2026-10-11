// Créneaux horaires : matin, midi, soir, nuit, à l'heure LOCALE du patient (L3-02 : fuseau du patient,
// heure d'été comprise ; voir timezone.ts).
import { localHour, resolveTimeZone, type PatientTimeZone } from './timezone';
import type { GlucosePoint } from './types';

export type TimeSlot = 'MORNING' | 'NOON' | 'EVENING' | 'NIGHT';

/** Créneau d'une heure locale : matin 5 h–11 h, midi 11 h–16 h, soir 16 h–22 h, nuit 22 h–5 h. */
export function slotOfHour(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return 'MORNING';
  if (hour >= 11 && hour < 16) return 'NOON';
  if (hour >= 16 && hour < 22) return 'EVENING';
  return 'NIGHT';
}

export function slotOf(at: number, timeZone?: PatientTimeZone): TimeSlot {
  return slotOfHour(localHour(at, resolveTimeZone(timeZone)(at)));
}

export function groupBySlot(
  points: GlucosePoint[],
  timeZone?: PatientTimeZone,
): Record<TimeSlot, GlucosePoint[]> {
  const offsetAt = resolveTimeZone(timeZone); // fuseau vérifié une seule fois
  const out: Record<TimeSlot, GlucosePoint[]> = { MORNING: [], NOON: [], EVENING: [], NIGHT: [] };
  for (const p of points) out[slotOfHour(localHour(p.at, offsetAt(p.at)))].push(p);
  return out;
}
