// Textes en français pour chaque type d'observation. Toujours disponibles, même sans LLM ni réseau
// (donc aussi hors-ligne sur le téléphone). Formulation descriptive uniquement : jamais de
// diagnostic, de cause affirmée, de dose ni de conseil de traitement.
import type { Insight } from './types';

export const DISCLAIMER_FR =
  'Ces observations sont statistiques. Elles ne constituent pas un diagnostic. En cas de doute, parlez-en à votre professionnel de santé.';

const SLOT_FR: Record<string, string> = {
  MORNING: 'matin',
  NOON: 'midi',
  EVENING: 'soir',
  NIGHT: 'nuit',
};

export function renderInsightFr(insight: Insight): string {
  const f = insight.facts;
  switch (insight.type) {
    case 'REPEATED_HYPO':
      return `J'observe ${f.count} mesures sous le seuil bas au cours des ${f.days} derniers jours.`;
    case 'HIGH_STREAK':
      return `J'observe une série de ${f.length} mesures consécutives au-dessus du seuil haut.`;
    case 'ANOMALY':
      return `${f.count} mesure(s) diffèrent sensiblement de votre historique récent.`;
    case 'TIME_OF_DAY_PATTERN':
      return `Les valeurs hautes sont plus fréquentes sur le créneau « ${SLOT_FR[String(f.slot)] ?? String(f.slot)} » (${f.slotAbovePct} % contre ${f.globalAbovePct} % en général).`;
    case 'MISSING_DATA':
      return `${f.daysWithoutData} jour(s) sur ${f.daysInPeriod} ne contiennent aucune mesure : certaines analyses peuvent être incomplètes.`;
    case 'PERIOD_COMPARISON':
      return `Temps dans la cible : ${f.timeInRangePct} % (période précédente : ${f.previousTimeInRangePct} %).`;
    case 'TREND':
      return `Tendance observée sur la période.`;
  }
}
