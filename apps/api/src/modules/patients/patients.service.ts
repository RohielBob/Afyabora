import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { PatientProfileInput } from '@glyka/shared';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

/** Réponse de GET/PUT /me/profile (contrat : PatientProfileResponse). */
export interface PatientProfileResponse {
  firstName: string;
  lastName: string;
  birthDate: string; // « AAAA-MM-JJ »
  sex: 'F' | 'M' | 'OTHER';
  diabetesType: PatientProfileInput['diabetesType'];
  diagnosisYear?: number;
  preferredUnit: PatientProfileInput['preferredUnit'];
  thresholds: PatientProfileInput['thresholds'];
  thresholdsReviewedByClinician: boolean;
  emergencyContact?: { name: string; phone: string; relation?: string };
  updatedAt: string; // UTC, suffixe Z (règle du projet)
}

// Champs lus en base : ni plus ni moins que ce que la réponse expose.
const PROFILE_SELECT = {
  firstName: true,
  lastName: true,
  birthDate: true,
  sex: true,
  diabetesType: true,
  diagnosisYear: true,
  preferredUnit: true,
  veryLowMgDl: true,
  targetMinMgDl: true,
  targetMaxMgDl: true,
  veryHighMgDl: true,
  thresholdsReviewedByClinician: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelation: true,
  updatedAt: true,
} as const;

type ProfileRow = {
  firstName: string;
  lastName: string;
  birthDate: Date;
  sex: string;
  diabetesType: PatientProfileInput['diabetesType'];
  diagnosisYear: number | null;
  preferredUnit: PatientProfileInput['preferredUnit'];
  veryLowMgDl: number;
  targetMinMgDl: number;
  targetMaxMgDl: number;
  veryHighMgDl: number;
  thresholdsReviewedByClinician: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  updatedAt: Date;
};

/**
 * Profil médical du patient (ticket L1-05).
 * PROPRIÉTÉ : l'identifiant vient TOUJOURS du jeton (@CurrentUser), jamais de l'URL ni du corps :
 * il n'existe aucun moyen de demander le profil de quelqu'un d'autre.
 */
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /me/profile : 404 tant que le profil n'est pas créé (le mobile lance alors l'assistant de profil). */
  async getProfile(userId: string): Promise<PatientProfileResponse> {
    const row = await this.prisma.patientProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        message: "Profil non encore créé : complétez l'assistant de profil.",
      });
    }
    return toResponse(row);
  }

  /**
   * PUT /me/profile : crée le profil ou le REMPLACE entièrement (un champ facultatif absent est effacé).
   * Les seuils sont stockés en mg/dL entiers ; changer l'unité préférée ne touche jamais aux mesures (ADR-0002).
   */
  async upsertProfile(userId: string, input: PatientProfileInput): Promise<PatientProfileResponse> {
    const data = {
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: new Date(`${input.birthDate}T00:00:00Z`), // colonne « date » : jour seul, sans fuseau
      sex: input.sex,
      diabetesType: input.diabetesType,
      diagnosisYear: input.diagnosisYear ?? null,
      preferredUnit: input.preferredUnit,
      veryLowMgDl: input.thresholds.veryLowMgDl,
      targetMinMgDl: input.thresholds.targetMinMgDl,
      targetMaxMgDl: input.thresholds.targetMaxMgDl,
      veryHighMgDl: input.thresholds.veryHighMgDl,
      thresholdsReviewedByClinician: input.thresholdsReviewedByClinician,
      emergencyContactName: input.emergencyContact?.name ?? null,
      emergencyContactPhone: input.emergencyContact?.phone ?? null,
      emergencyContactRelation: input.emergencyContact?.relation ?? null,
    };

    try {
      const row = await this.prisma.patientProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        select: PROFILE_SELECT,
      });
      return toResponse(row);
    } catch (error) {
      // P2003 = clé étrangère : le compte du jeton n'existe plus (supprimé il y a moins de 15 min).
      if (hasCode(error, 'P2003'))
        throw new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
      throw error;
    }
  }
}

function toResponse(row: ProfileRow): PatientProfileResponse {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    sex: row.sex as PatientProfileResponse['sex'],
    diabetesType: row.diabetesType,
    ...(row.diagnosisYear !== null ? { diagnosisYear: row.diagnosisYear } : {}),
    preferredUnit: row.preferredUnit,
    thresholds: {
      veryLowMgDl: row.veryLowMgDl,
      targetMinMgDl: row.targetMinMgDl,
      targetMaxMgDl: row.targetMaxMgDl,
      veryHighMgDl: row.veryHighMgDl,
    },
    thresholdsReviewedByClinician: row.thresholdsReviewedByClinician,
    ...(row.emergencyContactName && row.emergencyContactPhone
      ? {
          emergencyContact: {
            name: row.emergencyContactName,
            phone: row.emergencyContactPhone,
            ...(row.emergencyContactRelation ? { relation: row.emergencyContactRelation } : {}),
          },
        }
      : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
