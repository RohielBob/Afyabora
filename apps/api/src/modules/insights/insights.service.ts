// Analyse des mesures du patient (ticket L3-03) : GET /insights et GET /quality.
//
// Règles (CDC F6 et §5, ADR-0005) :
//  - TOUS les chiffres viennent de @glyka/analytics (le même moteur que sur le téléphone) : ce service
//    ne calcule rien lui-même, il lit les mesures, choisit la période et met le résultat en forme ;
//  - période = les N derniers jours ENTIERS du patient (minuit à minuit, à SON heure locale). La réponse
//    est construite par `analyzeLastDays`, la MÊME fonction que le téléphone hors-ligne (L8-11) : les deux
//    affichent exactement les mêmes chiffres, observations et phrases ;
//  - seuils personnels du patient (profil) et fuseau du profil (créneaux, jours : L3-02) ;
//  - sous 10 mesures : `stats` nul et aucune observation (« Données insuffisantes ») ;
//  - chaque observation garde ses preuves (`evidenceIds`) et reçoit une phrase : celle du modèle de
//    langage si elle est prête et a passé les garde-fous (L3-05, InsightWriter), sinon le gabarit français
//    du moteur (descriptif, jamais un diagnostic). La réponse n'attend jamais le modèle ;
//  - RÉSUMÉ de la période en langage clair (L3-06, IA-3, champ `summary`, contrat 0.3.0) : même principe.
// PROPRIÉTÉ : le patient vient TOUJOURS du jeton ; seules ses mesures non supprimées sont lues.
// Aucune valeur de santé dans les journaux.
import { Injectable, Logger } from '@nestjs/common';
import {
  analysisWindow,
  analyzeLastDays,
  computeQuality,
  DEFAULT_TIME_ZONE,
  lastDaysPeriod,
  resolveTimeZone,
  type GlucosePoint,
  type LastDaysAnalysis,
  type PatientTimeZone,
  type QualityScore,
} from '@glyka/analytics';
import { DEFAULT_THRESHOLDS, type GlucoseThresholds } from '@glyka/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { InsightWriter } from './llm/insight-writer.service';

/** Réponse de GET /insights (schéma `InsightsResponse` du contrat). */
export type InsightsResponse = LastDaysAnalysis;

/** Ce qu'il faut pour analyser : mesures, seuils et fuseau du patient, heure de la lecture. */
interface AnalysisInput {
  points: GlucosePoint[];
  now: number;
  thresholds: GlucoseThresholds;
  timeZone: PatientTimeZone;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: InsightWriter,
  ) {}

  /** GET /insights?period : statistiques, comparaison, observations traçables et leurs phrases. */
  async insights(patientId: string, days: number): Promise<InsightsResponse> {
    const { points, now, thresholds, timeZone } = await this.load(patientId, days);
    const analysis = analyzeLastDays(points, days, { now, thresholds, timeZone });
    // Phrases et résumé : reformulés par le modèle s'ils sont prêts et validés, sinon gabarits du moteur.
    const written = this.writer.write(analysis.insights, analysis.summary);
    return {
      ...analysis,
      insights: written.insights,
      summary: written.summary ?? analysis.summary,
    };
  }

  /** GET /quality?period : score de qualité des données (couverture, densité, fraîcheur). */
  async quality(patientId: string, days: number): Promise<QualityScore> {
    const { points, now, timeZone } = await this.load(patientId, days);
    return computeQuality(points, lastDaysPeriod(days, now, timeZone), now, timeZone);
  }

  private async load(patientId: string, days: number): Promise<AnalysisInput> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: {
        veryLowMgDl: true,
        targetMinMgDl: true,
        targetMaxMgDl: true,
        veryHighMgDl: true,
        timezoneOffsetMinutes: true,
      },
    });
    // Sans profil (inscription pas terminée), il n'y a pas de mesure : seuils et fuseau par défaut.
    const thresholds: GlucoseThresholds = profile
      ? {
          veryLowMgDl: profile.veryLowMgDl,
          targetMinMgDl: profile.targetMinMgDl,
          targetMaxMgDl: profile.targetMaxMgDl,
          veryHighMgDl: profile.veryHighMgDl,
        }
      : DEFAULT_THRESHOLDS;
    const timeZone = this.timeZoneOf(profile?.timezoneOffsetMinutes);

    const now = Date.now();
    // On lit la période ET la période PRÉCÉDENTE (même durée) : comparaison « 7 derniers jours / 7 d'avant ».
    // Elle couvre au moins 14 jours, donc la dernière mesure utile à la fraîcheur (≤ 7 jours) aussi.
    const window = analysisWindow(days, now, timeZone);
    const rows = await this.prisma.measurement.findMany({
      where: {
        patientId,
        deletedAt: null,
        measuredAt: { gte: new Date(window.from), lt: new Date(window.to) },
      },
      select: { id: true, measuredAt: true, valueMgDl: true },
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
    });
    const points = rows.map((r) => ({ id: r.id, at: r.measuredAt.getTime(), mgDl: r.valueMgDl }));
    return { points, now, thresholds, timeZone };
  }

  /**
   * Fuseau du profil (décalage fixe en minutes, UTC+1 par défaut). Une valeur impossible en base ne doit
   * pas empêcher le patient de voir son analyse : on prend le fuseau par défaut et on le SIGNALE dans les
   * journaux (sans aucune donnée de santé).
   */
  private timeZoneOf(offset: number | undefined): PatientTimeZone {
    if (offset === undefined) return DEFAULT_TIME_ZONE;
    try {
      resolveTimeZone(offset);
      return offset;
    } catch {
      this.logger.warn('Décalage horaire du profil invalide : fuseau par défaut (UTC+1) utilisé.');
      return DEFAULT_TIME_ZONE;
    }
  }
}
