// Score de qualité des données (L2-08, CDC F3 et §5.3) : la LOGIQUE, sans interface (testée dans
// __tests__/quality.test.ts). Le score vient du moteur @glyka/analytics (`computeQuality`, ADR-0005) :
//   Score = 0,5 × Couverture + 0,3 × Densité + 0,2 × Fraîcheur.
// Ici on l'appelle CORRECTEMENT depuis le téléphone, et on choisit la phrase d'explication :
//  - période = des jours ENTIERS (jusqu'à la fin d'aujourd'hui), sinon « 7 jours » compterait pour 6 ;
//  - fuseau du téléphone (le moteur suppose UTC+1 par défaut) : une mesure à 23 h 30 et une à 0 h 30 sont
//    bien sur deux jours différents pour le patient ;
//  - la phrase parle de ce qui fait le plus baisser le score (couverture, densité ou fraîcheur) ; elle ne dit
//    « tout va bien » que si les trois composantes sont bonnes (un score « Bonne » peut cacher 57 jours
//    mesurés sur 90 : on le dit plutôt que de rassurer à tort).
import { computeQuality, type QualityScore } from '@glyka/analytics';
import { QUALITY_TARGET_MEASUREMENTS_PER_DAY } from '@glyka/shared';
import { periodBounds, type ChartPeriod, type ChartPoint } from './chart';

/** Ce que dit la phrase : tout va bien, ou la composante qui pèse le plus sur le score. */
export type QualityReason = 'empty' | 'good' | 'coverage' | 'density' | 'freshness';

export interface PeriodQuality {
  quality: QualityScore;
  /** Nombre de mesures de la période. */
  count: number;
  /** Mesures par jour mesuré (une décimale), 0 si aucune. */
  perDay: number;
  /** Jours entiers depuis la dernière mesure (toutes périodes), null s'il n'y en a aucune. */
  daysSinceLast: number | null;
  reason: QualityReason;
}

const DAY_MS = 86_400_000;

function nextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

/** Poids de la formule (§5.3) : la « perte » d'une composante = poids × ce qui lui manque. */
const WEIGHTS = { coverage: 0.5, density: 0.3, freshness: 0.2 } as const;

/** En dessous de ce pourcentage, une composante mérite d'être nommée dans la phrase. */
export const GOOD_PART = 80;

/** Composante qui fait perdre le plus de points (à égalité : couverture, puis densité, puis fraîcheur). */
export function weakestPart(q: Pick<QualityScore, 'coverage' | 'density' | 'freshness'>) {
  const losses = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
    key,
    loss: WEIGHTS[key] * (100 - q[key]),
  }));
  return losses.reduce((worst, item) => (item.loss > worst.loss ? item : worst)).key;
}

export function periodQuality(
  points: readonly ChartPoint[],
  days: ChartPeriod,
  now: Date,
): PeriodQuality {
  const period = { from: periodBounds(days, now).from, to: nextMidnight(now) };
  const engine = points.map((p) => ({ id: p.id, at: p.at, mgDl: p.mgDl }));
  // Décalage du fuseau du téléphone en minutes (UTC+1 → 60), comme l'attend le moteur.
  const tzOffsetMinutes = -now.getTimezoneOffset();
  const quality = computeQuality(engine, period, now.getTime(), tzOffsetMinutes);

  const count = points.filter((p) => p.at >= period.from && p.at < period.to).length;
  const perDay =
    quality.daysWithData === 0 ? 0 : Math.round((count / quality.daysWithData) * 10) / 10;
  const last = points.reduce((max, p) => (p.at <= now.getTime() && p.at > max ? p.at : max), -1);
  const daysSinceLast = last < 0 ? null : Math.floor((now.getTime() - last) / DAY_MS);

  let reason: QualityReason;
  if (count === 0) reason = 'empty';
  else if (Math.min(quality.coverage, quality.density, quality.freshness) >= GOOD_PART)
    reason = 'good';
  else reason = weakestPart(quality);

  return { quality, count, perDay, daysSinceLast, reason };
}

/** Cible de densité du cahier des charges (3 mesures par jour mesuré), pour la phrase. */
export const TARGET_PER_DAY = QUALITY_TARGET_MEASUREMENTS_PER_DAY;
