// Rapport « Préparer ma consultation » (L6-02, CDC F9) : GÉNÉRATION à partir de la base, pour le patient
// (GET /reports/consultation) et pour un médecin autorisé (GET /doctor/sessions/:id/report, module `doctor`).
//  - Lit le profil (identité limitée, unité, seuils, fuseau) et les mesures NON SUPPRIMÉES de la fenêtre
//    d'analyse (la période ET la période précédente, pour la comparaison) : exactement ce que lit l'écran
//    « Analyse » (InsightsService). Le reste (chiffres, textes, mise en page) est le modèle de L6-01.
//  - PROPRIÉTÉ : le patient vient toujours de l'appelant (jeton du patient, ou session vérifiée pour un
//    médecin) ; seules ses mesures sont lues.
//  - Aucune donnée de santé dans les journaux du serveur.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { analysisWindow, DEFAULT_TIME_ZONE, resolveTimeZone } from '@glyka/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { buildReport, type ReportAuthor, type ReportDays, type ReportInput } from './report-data';
import { renderReportPdf } from './report-document';
import { reportView } from './report-view';

export const PROFILE_MISSING_MESSAGE =
  'Profil introuvable : terminez votre inscription pour préparer un rapport.';

/** Le PDF et le nom proposé pour le fichier. */
export interface ConsultationReport {
  pdf: Buffer;
  filename: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger('Reports');

  constructor(private readonly prisma: PrismaService) {}

  /** Le rapport PDF du patient sur `days` jours. */
  async consultation(
    patientId: string,
    days: ReportDays,
    author: ReportAuthor,
    now = Date.now(),
  ): Promise<ConsultationReport> {
    const input = await this.reportInput(patientId, days, author, now);
    const pdf = await renderReportPdf(reportView(buildReport(input)));
    return { pdf, filename: reportFilename(input.now, days, input.patient.timezoneOffsetMinutes) };
  }

  /** Ce que le modèle reçoit : profil et mesures, lus en base (testé à part : test/reports-routes.test.ts). */
  async reportInput(
    patientId: string,
    days: ReportDays,
    author: ReportAuthor,
    now = Date.now(),
  ): Promise<ReportInput> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: {
        firstName: true,
        lastName: true,
        diabetesType: true,
        diagnosisYear: true,
        preferredUnit: true,
        veryLowMgDl: true,
        targetMinMgDl: true,
        targetMaxMgDl: true,
        veryHighMgDl: true,
        timezoneOffsetMinutes: true,
      },
    });
    if (!profile) throw new NotFoundException({ message: PROFILE_MISSING_MESSAGE });

    const timezoneOffsetMinutes = this.timeZoneOf(profile.timezoneOffsetMinutes);
    const window = analysisWindow(days, now, timezoneOffsetMinutes);
    const rows = await this.prisma.measurement.findMany({
      where: {
        patientId,
        deletedAt: null,
        measuredAt: { gte: new Date(window.from), lt: new Date(window.to) },
      },
      select: { id: true, measuredAt: true, valueMgDl: true, context: true },
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
    });

    return {
      patient: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        diabetesType: profile.diabetesType,
        diagnosisYear: profile.diagnosisYear,
        preferredUnit: profile.preferredUnit,
        thresholds: {
          veryLowMgDl: profile.veryLowMgDl,
          targetMinMgDl: profile.targetMinMgDl,
          targetMaxMgDl: profile.targetMaxMgDl,
          veryHighMgDl: profile.veryHighMgDl,
        },
        timezoneOffsetMinutes,
      },
      measurements: rows.map((r) => ({
        id: r.id,
        at: r.measuredAt.getTime(),
        mgDl: r.valueMgDl,
        context: r.context,
      })),
      days,
      now,
      author,
    };
  }

  /** Décalage du profil ; impossible en base : fuseau par défaut, signalé sans donnée de santé. */
  private timeZoneOf(offset: number): number {
    try {
      resolveTimeZone(offset);
      return offset;
    } catch {
      this.logger.warn('Décalage horaire du profil invalide : fuseau par défaut (UTC+1) utilisé.');
      return DEFAULT_TIME_ZONE as number;
    }
  }
}

/**
 * « afyabora-rapport-2026-10-19-30j.pdf » : date du jour (heure du patient) et période. Pas de nom dans le nom
 * du fichier : il apparaît dans les téléchargements, l'historique du navigateur et les pièces jointes.
 */
export function reportFilename(now: number, days: number, offsetMinutes: number): string {
  const day = new Date(now + offsetMinutes * 60_000).toISOString().slice(0, 10);
  return `afyabora-rapport-${day}-${days}j.pdf`;
}
