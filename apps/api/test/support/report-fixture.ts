// Données FICTIVES et déterministes pour tester le rapport (L6-01) : toujours les mêmes mesures, sans hasard.
// 3 mesures par jour (à jeun, après le repas de midi, au coucher), quelques valeurs basses le soir, des
// valeurs hautes après le repas, une valeur très inhabituelle, et des jours sans mesure.
import type { ReportMeasurement, ReportPatient } from '../../src/modules/reports/report-data';

export const PATIENT: ReportPatient = {
  firstName: 'Awa',
  lastName: 'Mbuyi',
  diabetesType: 'TYPE_1',
  diagnosisYear: 2015,
  preferredUnit: 'G_L',
  // Seuils PERSONNELS (différents des valeurs par défaut) : un rapport qui les oublierait serait détecté.
  thresholds: { veryLowMgDl: 60, targetMinMgDl: 75, targetMaxMgDl: 175, veryHighMgDl: 240 },
  timezoneOffsetMinutes: 60, // Kinshasa
};

/** « Maintenant » : 19 octobre 2026, 10:42 à Kinshasa. */
export const NOW = Date.UTC(2026, 9, 19, 9, 42);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Minuit (heure de Kinshasa) du jour `daysAgo` avant NOW. */
const localMidnight = (daysAgo: number) => Date.UTC(2026, 9, 19 - daysAgo) - HOUR;

/** Mesures des `days` derniers jours ET de la période précédente (comparaison). */
export function fixtureMeasurements(days: number): ReportMeasurement[] {
  const out: ReportMeasurement[] = [];
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  for (let d = 0; d < days * 2; d++) {
    if (d % 11 === 4 || d % 13 === 7) continue; // jours sans mesure
    const midnight = localMidnight(d);
    const slots: [number, ReportMeasurement['context'], number][] = [
      [7.5, 'FASTING', 95 + ((d * 7) % 30)],
      [13.5, 'AFTER_MEAL', 150 + ((d * 13) % 75)],
      [21, 'BEDTIME', d % 6 === 1 ? 62 : d % 17 === 3 ? 48 : 115 + ((d * 5) % 40)],
    ];
    for (const [hour, context, mgDl] of slots) {
      const at = midnight + hour * HOUR;
      if (at > NOW) continue;
      out.push({ id: id(), at, mgDl, context });
    }
    if (d === 3) out.push({ id: id(), at: midnight + 16 * HOUR, mgDl: 410, context: 'OTHER' });
  }
  return out;
}

export { DAY, HOUR };
