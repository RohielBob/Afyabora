// Médecin APPROUVÉ seulement (ADR-0003) : le scan d'un QR (L5-03) et toutes les routes du portail qui
// montrent un patient (L5-11, L5-12) passent par ce contrôle. Le rôle DOCTOR est vérifié avant (@Roles) ;
// ici, le statut du compte, relu en base à CHAQUE requête (un compte peut être refusé entre-temps).
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';

export const DOCTOR_NOT_APPROVED_MESSAGE =
  "Votre compte médecin n'est pas encore approuvé : vous ne pouvez pas encore consulter de dossier.";

/** Compte supprimé (jeton encore valable) ⇒ 401 ; pas (encore) approuvé ⇒ 403 DOCTOR_NOT_APPROVED. */
export async function requireApprovedDoctor(
  prisma: PrismaService,
  doctorId: string,
): Promise<void> {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { doctorProfile: { select: { verificationStatus: true } } },
  });
  if (!doctor) throw new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
  if (doctor.doctorProfile?.verificationStatus !== 'APPROVED') {
    throw new ForbiddenException({
      message: DOCTOR_NOT_APPROVED_MESSAGE,
      code: 'DOCTOR_NOT_APPROVED',
    });
  }
}
