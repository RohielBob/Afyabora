// Portail médecin (lot L5, CDC F8). Ce fichier grandit ticket après ticket (voir le README du module).
//
// L5-11 : GET /doctor/sessions, « Mes patients partagés ».
//  - Médecin APPROUVÉ seulement (doctor-approval.ts), revérifié à chaque requête.
//  - Seulement les sessions ouvertes par CE médecin (scannées par lui), en cours ou terminées.
//  - Les accès échus sont expirés AVANT la lecture (même règle que partout, share-expiry.ts) : la liste ne
//    montre jamais « en cours » un accès dont l'heure est passée.
//  - Pendant l'accès seulement, et si le patient a partagé son HISTORIQUE GLYCÉMIQUE : date de la dernière
//    mesure et qualité des données (30 derniers jours, même calcul et même période par défaut que
//    l'application du patient, InsightsService). Accès terminé ou catégorie non partagée : null. Une
//    donnée de santé n'est jamais renvoyée hors de ce que le patient a autorisé.
//  - Accès en cours d'abord, puis du plus récent au plus ancien ; 100 sessions au plus.
//  - Cette liste ne lit pas le dossier : aucune ligne dans le journal d'accès (les consultations du
//    dossier, L5-12, y seront écrites).
import { Injectable } from '@nestjs/common';
import type {
  DiabetesType,
  DoctorSessionDto,
  DoctorSessionList,
  ShareCategory,
} from '@glyka/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { InsightsService } from '../insights/insights.service';
import { requireApprovedDoctor } from '../sharing/doctor-approval';
import { expireDueSessions } from '../sharing/share-expiry';

/** Période de la qualité affichée : la période par défaut de l'application du patient (30 jours). */
export const LIST_QUALITY_DAYS = 30;
/** Nombre maximal de sessions renvoyées. */
export const LIST_LIMIT = 100;

@Injectable()
export class DoctorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsService,
  ) {}

  /** GET /doctor/sessions (L5-11). */
  async listSessions(doctorId: string, now = new Date()): Promise<DoctorSessionList> {
    await requireApprovedDoctor(this.prisma, doctorId);

    // Accès échus de ce médecin : expirés tout de suite (une ligne SHARE_EXPIRED chacun).
    const due = await this.prisma.shareSession.findMany({
      where: { claimedByDoctorId: doctorId, status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.prisma.$transaction((tx) => expireDueSessions(tx, now, id));
    }

    const rows = await this.prisma.shareSession.findMany({
      where: { claimedByDoctorId: doctorId, claimedAt: { not: null } },
      orderBy: [{ claimedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        status: true,
        claimedAt: true,
        expiresAt: true,
        categories: true,
        patientId: true,
        patient: { select: { firstName: true, diabetesType: true } },
      },
    });
    const items = await Promise.all(rows.map((row) => this.toDto(row)));
    // Accès en cours d'abord (le tri par date est conservé à l'intérieur de chaque groupe).
    items.sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'));
    return { items };
  }

  private async toDto(row: {
    id: string;
    status: string;
    claimedAt: Date | null;
    expiresAt: Date | null;
    categories: string[];
    patientId: string;
    patient: { firstName: string; diabetesType: string };
  }): Promise<DoctorSessionDto> {
    const categories = row.categories as ShareCategory[];
    const glucose = row.status === 'ACTIVE' && categories.includes('GLUCOSE_HISTORY');
    const [last, quality] = glucose
      ? await Promise.all([
          this.prisma.measurement.findFirst({
            where: { patientId: row.patientId, deletedAt: null },
            orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
            select: { measuredAt: true },
          }),
          this.insights.quality(row.patientId, LIST_QUALITY_DAYS),
        ])
      : [null, null];
    return {
      sessionId: row.id,
      status: row.status as DoctorSessionDto['status'],
      claimedAt: (row.claimedAt as Date).toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      categories,
      patient: {
        firstName: row.patient.firstName,
        diabetesType: row.patient.diabetesType as DiabetesType,
      },
      lastMeasurementAt: last?.measuredAt.toISOString() ?? null,
      quality: quality ? { score: quality.score, level: quality.level } : null,
    };
  }
}
