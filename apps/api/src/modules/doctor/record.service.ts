// Dossier partagé, lu par le médecin (L5-12, CDC F8, ADR-0003) : GET /doctor/sessions/:id/summary,
// /measurements et /timeline. Lecture seule.
//
// À CHAQUE requête, avant de lire quoi que ce soit (open()) :
//  1. le médecin est toujours APPROUVÉ (doctor-approval.ts) ;
//  2. la session est ACTIVE, à CE médecin, pas échue à l'horloge du SERVEUR, et la catégorie demandée est
//     partagée (ShareLifecycleService.requireActiveAccess, L5-04) : sinon 403 SESSION_EXPIRED,
//     SESSION_REVOKED ou CATEGORY_NOT_SHARED ; session d'un autre médecin : 403 ; inconnue : 404 ;
//  3. la consultation est journalisée sous verrou (record-view.ts : une ligne par moment de lecture).
//
// Filtre des catégories, CÔTÉ SERVEUR (une donnée non partagée ne quitte jamais la base) :
//  - glycémies : GLUCOSE_HISTORY ; note personnelle d'une mesure : seulement avec PERSONAL_NOTES ;
//  - chronologie : mesures (GLUCOSE_HISTORY), repas (MEALS), activités (ACTIVITY), traitements déclarés
//    (TREATMENTS), chacun seulement s'il est partagé ; durée des évènements et lot des mesures importées ;
//    texte libre des évènements (ex. dose déclarée) seulement avec PERSONAL_NOTES (contrat 0.4.2) ;
//  - résumé : identité limitée (prénom, type, année du diagnostic, unité, seuils) toujours ; qualité et
//    statistiques des 30 derniers jours si les glycémies OU le résumé des analyses sont partagés (sinon
//    qualité calculée sur zéro mesure et statistiques nulles : rien n'est révélé) ; observations de
//    l'analyse seulement avec AI_SUMMARY (leurs preuves, des identifiants de mesures, seulement si les
//    glycémies sont aussi partagées).
// Les nombres viennent tous de @glyka/analytics (InsightsService), comme dans l'application du patient.
// Aucune valeur de santé dans les journaux du serveur.
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type DoctorSummary,
  type GlucoseThresholds,
  type ListQuery,
  type MeasurementListDto,
  type ShareCategory,
  type TimelineList,
} from '@glyka/shared';
import { decryptOptionalText } from '../../common/crypto/field-encryption';
import { afterCursor, decodeCursor, encodeCursor, notFound } from '../../common/data/owned-records';
import { PrismaService } from '../../prisma/prisma.service';
import { InsightsService } from '../insights/insights.service';
import { requireApprovedDoctor } from '../sharing/doctor-approval';
import {
  CATEGORY_NOT_SHARED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  ShareLifecycleService,
  type ActiveAccess,
} from '../sharing/share-lifecycle.service';
import {
  busyAsUnavailable,
  CREATE_TRANSACTION,
  SESSION_NOT_FOUND_MESSAGE,
} from '../sharing/sharing.service';
import { ReportsService, withShareCode, type ConsultationReport } from '../reports/reports.service';
import type { ReportDays } from '../reports/report-data';
import { recordView } from './record-view';
import { eventEntry, measurementEntry, mergeTimeline } from './timeline';

/** Période du résumé : la période par défaut de l'application du patient. */
export const SUMMARY_DAYS = 30;

/** Catégories qui donnent des lignes à la chronologie. */
export const TIMELINE_CATEGORIES: readonly ShareCategory[] = [
  'GLUCOSE_HISTORY',
  'MEALS',
  'ACTIVITY',
  'TREATMENTS',
];

/** Catégorie ⇒ type d'évènement déclaré. */
const EVENT_TYPE_OF = { MEALS: 'MEAL', ACTIVITY: 'ACTIVITY', TREATMENTS: 'TREATMENT' } as const;

/** Lecture demandée : une catégorie précise, ou au moins une catégorie d'une liste (chronologie). */
type Need = { category?: ShareCategory; anyOf?: readonly ShareCategory[] };

@Injectable()
export class DoctorRecordService {
  private readonly logger = new Logger('DoctorRecord');

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ShareLifecycleService,
    private readonly insights: InsightsService,
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
  ) {}

  // ------------------------------------------------------------------ résumé

  /** GET /doctor/sessions/:id/summary */
  async summary(doctorId: string, sessionId: string, ip?: string): Promise<DoctorSummary> {
    const access = await this.open(doctorId, sessionId, {}, ip);
    const shared = (category: ShareCategory) => access.categories.includes(category);
    const profile = await this.profileOf(access.patientId);

    let quality: DoctorSummary['quality'];
    let stats: DoctorSummary['stats'] = null;
    let insights: DoctorSummary['insights'];
    if (shared('AI_SUMMARY')) {
      // Même analyse que l'écran « Analyse » du patient (phrases relues par les garde-fous, L3-05).
      const analysis = await this.insights.insights(access.patientId, SUMMARY_DAYS);
      quality = analysis.quality;
      stats = analysis.stats;
      insights = analysis.insights.map((insight) => ({
        type: insight.type,
        severity: insight.severity,
        facts: insight.facts,
        // Preuves = identifiants de mesures : seulement si les glycémies sont partagées aussi.
        evidenceIds: shared('GLUCOSE_HISTORY') ? insight.evidenceIds : [],
        text: insight.text,
      }));
    } else if (shared('GLUCOSE_HISTORY')) {
      const analysis = await this.insights.engineAnalysis(access.patientId, SUMMARY_DAYS);
      quality = analysis.quality;
      stats = analysis.stats;
    } else {
      quality = await this.insights.emptyQuality(access.patientId, SUMMARY_DAYS);
    }

    return {
      session: {
        id: access.sessionId,
        status: 'ACTIVE',
        expiresAt: access.expiresAt.toISOString(),
        categories: access.categories,
      },
      patient: {
        firstName: profile.firstName,
        diabetesType: profile.diabetesType,
        diagnosisYear: profile.diagnosisYear,
        preferredUnit: profile.preferredUnit,
        thresholds: profile.thresholds,
      },
      quality,
      stats,
      ...(insights ? { insights } : {}),
    };
  }

  // ------------------------------------------------------------------ glycémies

  /** GET /doctor/sessions/:id/measurements : mêmes règles de période et de curseur que GET /measurements. */
  async measurements(
    doctorId: string,
    sessionId: string,
    query: ListQuery,
    ip?: string,
  ): Promise<MeasurementListDto> {
    const access = await this.open(doctorId, sessionId, { category: 'GLUCOSE_HISTORY' }, ip);
    const withNotes = access.categories.includes('PERSONAL_NOTES');
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.measurement.findMany({
      where: {
        patientId: access.patientId,
        deletedAt: null,
        measuredAt: this.period(query),
        ...(after ? afterCursor('measuredAt', after) : {}),
      },
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1, // une de plus : savoir s'il existe une page suivante
      select: {
        id: true,
        valueMgDl: true,
        originalValue: true,
        originalUnit: true,
        measuredAt: true,
        context: true,
        source: true,
        importBatchId: true,
        // La note chiffrée n'est même pas LUE si les notes personnelles ne sont pas partagées.
        noteEncrypted: withNotes,
        updatedAt: true,
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        id: row.id,
        valueMgDl: row.valueMgDl,
        originalValue: row.originalValue,
        originalUnit: row.originalUnit,
        measuredAt: row.measuredAt.toISOString(),
        context: row.context,
        source: row.source,
        importBatchId: row.importBatchId,
        note: withNotes ? this.decrypt(row.noteEncrypted ?? null) : null,
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: null, // les mesures supprimées ne sont jamais envoyées au médecin
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.measuredAt, last.id) : null,
    };
  }

  // ------------------------------------------------------------------ chronologie

  /** GET /doctor/sessions/:id/timeline : mesures et évènements partagés, mélangés par date. */
  async timeline(
    doctorId: string,
    sessionId: string,
    query: ListQuery,
    ip?: string,
  ): Promise<TimelineList> {
    const access = await this.open(doctorId, sessionId, { anyOf: TIMELINE_CATEGORIES }, ip);
    const shared = (category: ShareCategory) => access.categories.includes(category);
    const eventTypes = (['MEALS', 'ACTIVITY', 'TREATMENTS'] as const)
      .filter(shared)
      .map((category) => EVENT_TYPE_OF[category]);
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const period = this.period(query);
    // Texte libre des évènements : seulement avec les notes personnelles (contrat 0.4.2), comme la note d'une
    // mesure. Non partagé : la colonne chiffrée n'est même pas lue.
    const withNotes = shared('PERSONAL_NOTES');

    const [measurements, events] = await Promise.all([
      shared('GLUCOSE_HISTORY')
        ? Promise.all([
            this.prisma.measurement.findMany({
              where: {
                patientId: access.patientId,
                deletedAt: null,
                measuredAt: period,
                ...(after ? afterCursor('measuredAt', after) : {}),
              },
              orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
              take: query.limit + 1,
              select: {
                id: true,
                measuredAt: true,
                valueMgDl: true,
                context: true,
                source: true,
                importBatchId: true,
              },
            }),
            this.profileOf(access.patientId),
          ]).then(([rows, profile]) => rows.map((row) => measurementEntry(row, profile.thresholds)))
        : [],
      eventTypes.length > 0
        ? this.prisma.lifeEvent
            .findMany({
              where: {
                patientId: access.patientId,
                deletedAt: null,
                type: { in: eventTypes },
                occurredAt: period,
                ...(after ? afterCursor('occurredAt', after) : {}),
              },
              orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
              take: query.limit + 1,
              select: {
                id: true,
                occurredAt: true,
                type: true,
                label: true,
                durationMinutes: true,
                detailsEncrypted: withNotes,
              },
            })
            .then((rows) =>
              rows.map((row) =>
                eventEntry({
                  ...row,
                  details: withNotes ? this.decrypt(row.detailsEncrypted ?? null) : null,
                }),
              ),
            )
        : [],
    ]);

    const { page, last } = mergeTimeline([measurements, events], query.limit);
    return {
      items: page.map((entry) => entry.item),
      nextCursor: last ? encodeCursor(last.at, last.id) : null,
    };
  }

  // ------------------------------------------------------------------ rapport PDF

  /**
   * GET /doctor/sessions/:id/report (L6-02) : le rapport « Préparer ma consultation » du patient, s'il a coché
   * « Rapport PDF » (REPORT_DOWNLOAD). Le patient a choisi de remettre CE document : il est complet (mêmes
   * chiffres que le rapport du patient), sans note personnelle (le rapport n'en contient jamais). Chaque
   * téléchargement écrit une ligne REPORT_DOWNLOADED AVANT la génération ; l'auteur imprimé est le médecin.
   */
  async report(
    doctorId: string,
    sessionId: string,
    days: ReportDays,
    ip?: string,
  ): Promise<ConsultationReport> {
    const access = await this.open(
      doctorId,
      sessionId,
      { category: 'REPORT_DOWNLOAD' },
      ip,
      'REPORT_DOWNLOADED',
    );
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
      select: { firstName: true, lastName: true },
    });
    const name = doctor ? `${doctor.firstName} ${doctor.lastName}`.trim() : '';
    const report = await this.reports.consultation(
      access.patientId,
      days,
      name ? { kind: 'DOCTOR', name } : { kind: 'PATIENT' },
    );
    // Code court du partage dans le nom (L6-04) : le médecin distingue les rapports de ses patients.
    return { ...report, filename: withShareCode(report.filename, sessionId) };
  }

  // ------------------------------------------------------------------ contrôle d'accès

  /**
   * Avant TOUTE lecture : médecin approuvé, accès ouvert et catégorie partagée, puis consultation
   * journalisée sous verrou. Renvoie l'accès vérifié (patient, catégories, fin).
   */
  private async open(
    doctorId: string,
    sessionId: string,
    need: Need,
    ip?: string,
    action: 'SHARE_VIEWED' | 'REPORT_DOWNLOADED' = 'SHARE_VIEWED',
  ): Promise<ActiveAccess> {
    await requireApprovedDoctor(this.prisma, doctorId);
    const access = await this.lifecycle.requireActiveAccess(doctorId, sessionId, {
      category: need.category,
    });
    if (need.anyOf && !need.anyOf.some((category) => access.categories.includes(category))) {
      throw new ForbiddenException({
        message: CATEGORY_NOT_SHARED_MESSAGE,
        code: 'CATEGORY_NOT_SHARED',
      });
    }
    const stillOpen = await this.prisma
      .$transaction((tx) => recordView(tx, { sessionId, doctorId, ip, action }), CREATE_TRANSACTION)
      .catch(busyAsUnavailable);
    if (!stillOpen) {
      // Arrêté ou échu entre le contrôle et le verrou : le contrôle, rejoué, donne la bonne erreur.
      await this.lifecycle.requireActiveAccess(doctorId, sessionId);
      throw new ForbiddenException({ message: SESSION_EXPIRED_MESSAGE, code: 'SESSION_EXPIRED' });
    }
    return access;
  }

  // ------------------------------------------------------------------ outils

  /** Profil du patient : identité limitée et seuils personnels. */
  private async profileOf(patientId: string) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: {
        firstName: true,
        diabetesType: true,
        diagnosisYear: true,
        preferredUnit: true,
        veryLowMgDl: true,
        targetMinMgDl: true,
        targetMaxMgDl: true,
        veryHighMgDl: true,
      },
    });
    if (!profile) throw notFound(SESSION_NOT_FOUND_MESSAGE); // compte du patient supprimé entre-temps
    const thresholds: GlucoseThresholds = {
      veryLowMgDl: profile.veryLowMgDl,
      targetMinMgDl: profile.targetMinMgDl,
      targetMaxMgDl: profile.targetMaxMgDl,
      veryHighMgDl: profile.veryHighMgDl,
    };
    return {
      firstName: profile.firstName,
      diabetesType: profile.diabetesType,
      diagnosisYear: profile.diagnosisYear,
      preferredUnit: profile.preferredUnit,
      thresholds,
    };
  }

  /** Période [from ; to[ de la requête. */
  private period(query: ListQuery) {
    return {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lt: new Date(query.to) } : {}),
    };
  }

  /** Note illisible (clé changée, donnée abîmée) : null, avec un avertissement sans contenu. */
  private decrypt(payload: string | null): string | null {
    if (!payload) return null;
    return decryptOptionalText(
      payload,
      this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY'),
      () => this.logger.warn('Note illisible ignorée.'),
    );
  }
}
