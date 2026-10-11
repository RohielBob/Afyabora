// Analyse calculée SUR LE TÉLÉPHONE, depuis la base locale (L8-11, CDC F6 et F11) : la LOGIQUE, sans
// interface (testée dans __tests__/local-analysis.test.ts).
//
//  - aucune requête réseau : les mesures viennent de SQLite (ou du magasin en mémoire en aperçu web) ;
//  - la réponse est construite par `analyzeLastDays` de @glyka/analytics, la MÊME fonction que l'API
//    (GET /insights) : en ligne ou hors-ligne, le patient voit exactement les mêmes chiffres, observations
//    et phrases (gabarits français, jamais un diagnostic) ;
//  - période = les N derniers jours ENTIERS (minuit à minuit, heure du téléphone, heure d'été comprise) ;
//  - seuils du patient gardés sur le téléphone (L2-04).
import {
  analysisWindow,
  analyzeLastDays,
  type GlucosePoint,
  type LastDaysAnalysis,
  type PatientTimeZone,
} from '@glyka/analytics';
import type { GlucoseThresholds } from '@glyka/shared';
import { localMeasurements, type MeasurementPoint } from '@/features/measurements';
import { readThresholds } from '@/features/profile';
import { deviceTimeZone } from '@/lib/time-zone';

/** D'où viennent les données (remplaçable dans les tests). */
export interface LocalSources {
  /** Mesures non supprimées entre deux instants, bornes INCLUSES (comme `localMeasurements.between`). */
  between: (from: number, to: number) => Promise<MeasurementPoint[]>;
  thresholds: () => Promise<GlucoseThresholds>;
  timeZone: PatientTimeZone;
}

const deviceSources: LocalSources = {
  between: localMeasurements.between,
  thresholds: readThresholds,
  timeZone: deviceTimeZone,
};

/** Analyse + ce qu'il faut pour l'afficher (« Voir les mesures concernées », badges d'état). */
export interface LocalAnalysis {
  analysis: LastDaysAnalysis;
  /** Mesures lues (période et période précédente), du plus ancien au plus récent. */
  points: MeasurementPoint[];
  thresholds: GlucoseThresholds;
}

/** Analyse des `days` derniers jours à partir des mesures du téléphone. */
export async function loadLocalAnalysis(
  days: number,
  now: number,
  sources: LocalSources = deviceSources,
): Promise<LocalAnalysis> {
  const window = analysisWindow(days, now, sources.timeZone);
  const [points, thresholds] = await Promise.all([
    // Fin EXCLUE pour le moteur (minuit ce soir) ; la lecture locale inclut sa borne, d'où − 1 ms.
    sources.between(window.from, window.to - 1),
    sources.thresholds(),
  ]);
  // Seules l'identité, la date et la valeur comptent pour le moteur (pas le contexte).
  const engine: GlucosePoint[] = points.map((p) => ({ id: p.id, at: p.at, mgDl: p.mgDl }));
  const analysis = analyzeLastDays(engine, days, { now, thresholds, timeZone: sources.timeZone });
  return { analysis, points, thresholds };
}
