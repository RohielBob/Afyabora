// Générateur DÉTERMINISTE de séries de glycémie fictives pour la démonstration (ticket L7-07).
// Même graine = mêmes données : la démo est reproductible. Aucune donnée réelle.

export interface GeneratedMeasurement {
  measuredAt: Date;
  mgDl: number;
  context: 'FASTING' | 'BEFORE_MEAL' | 'AFTER_MEAL';
}

export interface SeriesProfile {
  seed: number;
  /** Dernier jour couvert (inclus). */
  endDate: Date;
  days: number;
  /** Probabilité qu'un jour contienne des mesures (couverture). */
  dayCoverage: number;
  /** Mesures par jour couvert (1 à 3). */
  perDay: 1 | 2 | 3;
  /** Valeurs plus hautes le soir (en mg/dL). */
  eveningBoost: number;
  /** Nombre de jours sans mesure juste avant endDate (données anciennes). */
  silentLastDays: number;
}

/** PRNG mulberry32 : petit, rapide, déterministe. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOTS = [
  { hour: 7, minute: 15, base: 108, context: 'FASTING' as const },
  { hour: 12, minute: 40, base: 128, context: 'BEFORE_MEAL' as const },
  { hour: 19, minute: 20, base: 150, context: 'AFTER_MEAL' as const },
];

/** Heure locale (UTC+1, Kinshasa) convertie en UTC. */
function atLocal(day: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 1, minute));
}

export function generateSeries(p: SeriesProfile): GeneratedMeasurement[] {
  const rnd = mulberry32(p.seed);
  const out: GeneratedMeasurement[] = [];
  for (let d = p.days - 1; d >= 0; d--) {
    if (d < p.silentLastDays) continue;
    if (rnd() > p.dayCoverage) continue;
    const day = new Date(Date.UTC(p.endDate.getUTCFullYear(), p.endDate.getUTCMonth(), p.endDate.getUTCDate() - d));
    const slots = p.perDay === 3 ? SLOTS : p.perDay === 2 ? [SLOTS[0]!, SLOTS[2]!] : [SLOTS[0]!];
    for (const s of slots) {
      const noise = (rnd() + rnd() + rnd() - 1.5) * 40; // ≈ gaussienne, écart ~ 20 mg/dL
      const boost = s.context === 'AFTER_MEAL' ? p.eveningBoost : 0;
      const mgDl = Math.round(Math.min(380, Math.max(52, s.base + boost + noise)));
      const jitter = Math.floor(rnd() * 20) - 10; // ± 10 min
      out.push({ measuredAt: atLocal(day, s.hour, s.minute + jitter), mgDl, context: s.context });
    }
  }
  return out.sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}

/** Les 3 profils de la démonstration : qualité Bonne / Partielle / Insuffisante. */
export const DEMO_PROFILES = {
  jean: { seed: 101, days: 90, dayCoverage: 0.97, perDay: 3, eveningBoost: 45, silentLastDays: 0 },
  marie: { seed: 202, days: 90, dayCoverage: 0.6, perDay: 2, eveningBoost: 20, silentLastDays: 1 },
  paul: { seed: 303, days: 90, dayCoverage: 0.55, perDay: 1, eveningBoost: 10, silentLastDays: 5 },
} satisfies Record<string, Omit<SeriesProfile, 'endDate'>>;
