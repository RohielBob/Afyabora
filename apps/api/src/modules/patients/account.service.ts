// Compte du patient (ticket L1-14) : export de toutes ses données et suppression du compte.
// CDC §6.3 : « le patient peut exporter ses données et supprimer son compte ».
//
// PROPRIÉTÉ : l'identifiant vient TOUJOURS du jeton (@CurrentUser), jamais de l'URL ni du corps.
// Aucune donnée de santé, aucun mot de passe ni identifiant dans les journaux.
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { decryptField } from '../../common/crypto/field-encryption';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PROFILE_SELECT, toResponse, type PatientProfileResponse } from './patients.service';

export const INVALID_PASSWORD_MESSAGE = 'Mot de passe incorrect.';

/** Profil exporté (contrat : PatientProfile, sans `updatedAt`). */
export type ExportedProfile = Omit<PatientProfileResponse, 'updatedAt'>;

/** Mesure exportée (contrat : Measurement). Dates en UTC (suffixe Z). */
export interface ExportedMeasurement {
  id: string;
  valueMgDl: number;
  originalValue: number;
  originalUnit: string;
  measuredAt: string;
  context: string;
  source: string;
  importBatchId: string | null;
  note: string | null;
  updatedAt: string;
  deletedAt: null;
}

/** Événement exporté (contrat : LifeEvent). */
export interface ExportedEvent {
  id: string;
  type: string;
  occurredAt: string;
  label: string;
  details: string | null;
  durationMinutes: number | null;
  updatedAt: string;
  deletedAt: null;
}

/** Réponse de GET /me/export (contrat : DataExport). */
export interface DataExport {
  exportedAt: string;
  profile: ExportedProfile;
  measurements: ExportedMeasurement[];
  events: ExportedEvent[];
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger('Account');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /me/export : profil, mesures et événements du patient, dans les formats du contrat.
   *  - les éléments supprimés (« tombstones » gardés pour la synchronisation) ne sont PAS exportés ;
   *  - les notes, chiffrées en base (AES-256-GCM), sont rendues lisibles ;
   *  - tri chronologique, dates en UTC.
   */
  async exportData(userId: string): Promise<DataExport> {
    const profileRow = await this.prisma.patientProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
    if (!profileRow) throw await this.missingProfile(userId);

    const [measurements, events] = await Promise.all([
      this.prisma.measurement.findMany({
        where: { patientId: userId, deletedAt: null },
        orderBy: { measuredAt: 'asc' },
        select: {
          id: true,
          valueMgDl: true,
          originalValue: true,
          originalUnit: true,
          measuredAt: true,
          context: true,
          source: true,
          importBatchId: true,
          noteEncrypted: true,
          updatedAt: true,
        },
      }),
      this.prisma.lifeEvent.findMany({
        where: { patientId: userId, deletedAt: null },
        orderBy: { occurredAt: 'asc' },
        select: {
          id: true,
          type: true,
          occurredAt: true,
          label: true,
          details: true,
          durationMinutes: true,
          updatedAt: true,
        },
      }),
    ]);

    const key = this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY');
    let unreadableNotes = 0;
    const readNote = (encrypted: string | null): string | null => {
      if (!encrypted) return null;
      try {
        return decryptField(encrypted, key);
      } catch {
        unreadableNotes += 1; // note abîmée ou chiffrée avec une autre clé : on n'empêche pas l'export
        return null;
      }
    };

    const { updatedAt: _updatedAt, ...profile } = toResponse(profileRow);
    const result: DataExport = {
      exportedAt: new Date().toISOString(),
      profile,
      measurements: measurements.map((m) => ({
        id: m.id,
        valueMgDl: m.valueMgDl,
        originalValue: m.originalValue,
        originalUnit: m.originalUnit,
        measuredAt: m.measuredAt.toISOString(),
        context: m.context,
        source: m.source,
        importBatchId: m.importBatchId,
        note: readNote(m.noteEncrypted),
        updatedAt: m.updatedAt.toISOString(),
        deletedAt: null,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurredAt.toISOString(),
        label: e.label,
        details: e.details,
        durationMinutes: e.durationMinutes,
        updatedAt: e.updatedAt.toISOString(),
        deletedAt: null,
      })),
    };
    // Seulement un nombre : ni identifiant, ni contenu de note.
    if (unreadableNotes)
      this.logger.warn(`Export : ${unreadableNotes} note(s) illisible(s) ignorée(s).`);
    return result;
  }

  /**
   * DELETE /me : le mot de passe est redemandé (un téléphone prêté ou volé, déverrouillé, ne suffit pas).
   * Tout est supprimé en UNE transaction : le compte, et par cascade le profil, les mesures, les événements,
   * les imports, les analyses, les partages (un médecin perd l'accès immédiatement), le journal d'accès,
   * la carte d'urgence, les préférences, les appareils, les jetons de session et d'email.
   * Les notifications en attente (table sans lien en cascade) sont effacées explicitement.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE }); // déjà supprimé

    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new ForbiddenException({ message: INVALID_PASSWORD_MESSAGE, code: 'INVALID_PASSWORD' });
    }

    await this.prisma.$transaction([
      this.prisma.notificationOutbox.deleteMany({ where: { userId } }),
      this.prisma.user.deleteMany({ where: { id: userId } }),
    ]);
    this.logger.log('Compte patient supprimé avec toutes ses données.');
  }

  /** Pas de profil : compte supprimé (jeton encore valide) ⇒ 401 ; sinon profil pas encore créé ⇒ 404. */
  private async missingProfile(userId: string): Promise<Error> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    return new NotFoundException({
      message: "Profil non encore créé : complétez l'assistant de profil.",
    });
  }
}
