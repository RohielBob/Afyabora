// Mesures de glycémie (ticket L2-01) : créer, lister, modifier, supprimer.
//
// Règles (CDC F2, ADR-0002, ADR-0004) :
//  - l'identifiant (UUID) vient du TÉLÉPHONE : rejouer la même création ne crée jamais de doublon (la
//    saisie hors-ligne renvoie ses requêtes quand le réseau revient) ;
//  - tout est stocké en mg/dL ENTIER ; la valeur et l'unité saisies sont gardées telles quelles ;
//  - hors des bornes plausibles (20–600 mg/dL) : refus (422 UNUSUAL_VALUE) sauf confirmation explicite ;
//  - date plus de 5 minutes dans le futur : refusée (400) ;
//  - note personnelle CHIFFRÉE en base (AES-256-GCM) ;
//  - suppression = « tombstone » (`deletedAt`) pour que la synchronisation la propage aux autres appareils.
// PROPRIÉTÉ : le patient vient TOUJOURS du jeton ; la mesure d'un autre patient est « introuvable » (404),
// sans jamais révéler qu'elle existe.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PLAUSIBLE_MAX_MG_DL,
  PLAUSIBLE_MIN_MG_DL,
  isPlausibleMgDl,
  toMgDl,
  type CreateMeasurementInput,
  type GlucoseUnit,
  type ListQuery,
  type MeasurementDto,
  type UpdateMeasurementInput,
} from '@glyka/shared';
import { decryptField, encryptField } from '../../common/crypto/field-encryption';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

/** Tolérance sur l'heure du téléphone, souvent légèrement en avance. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const UNUSUAL_VALUE_MESSAGE =
  'Valeur inhabituelle : vérifiez la saisie, puis confirmez-la si elle est correcte.';

// Colonnes lues : exactement ce que la réponse expose (+ la note chiffrée, déchiffrée avant l'envoi).
const SELECT = {
  id: true,
  patientId: true,
  valueMgDl: true,
  originalValue: true,
  originalUnit: true,
  measuredAt: true,
  context: true,
  source: true,
  importBatchId: true,
  noteEncrypted: true,
  updatedAt: true,
  deletedAt: true,
} as const;

type Row = {
  id: string;
  patientId: string;
  valueMgDl: number;
  originalValue: number;
  originalUnit: MeasurementDto['originalUnit'];
  measuredAt: Date;
  context: MeasurementDto['context'];
  source: MeasurementDto['source'];
  importBatchId: string | null;
  noteEncrypted: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
};

export interface MeasurementList {
  items: MeasurementDto[];
  nextCursor: string | null;
}

/** Création : la mesure, et si elle vient d'être créée (201) ou existait déjà (200, rejeu). */
export interface CreateResult {
  measurement: MeasurementDto;
  created: boolean;
}

@Injectable()
export class MeasurementsService {
  private readonly logger = new Logger('Measurements');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ création

  /** POST /measurements */
  async create(patientId: string, input: CreateMeasurementInput): Promise<CreateResult> {
    // Rejeu : la mesure existe déjà avec cet identifiant → on la renvoie telle quelle (aucune création).
    const existing = await this.findOwned(input.id, patientId);
    if (existing) return { measurement: this.toDto(existing), created: false };

    const now = new Date();
    const measuredAt = this.checkDate(input.measuredAt, now);
    const valueMgDl = this.checkValue(input.value, input.unit, input.confirmedUnusual);

    try {
      const row = await this.prisma.measurement.create({
        data: {
          id: input.id,
          patientId,
          valueMgDl,
          originalValue: input.value,
          originalUnit: input.unit,
          measuredAt,
          context: input.context,
          source: 'MANUAL',
          noteEncrypted: this.encryptNote(input.note),
          clientUpdatedAt: now,
        },
        select: SELECT,
      });
      return { measurement: this.toDto(row), created: true };
    } catch (error) {
      // P2002 = identifiant déjà pris. Deux envois SIMULTANÉS de la même mesure : le second arrive ici
      // après la création du premier → c'est un rejeu, on renvoie la mesure créée.
      if (hasCode(error, 'P2002')) {
        const winner = await this.findOwned(input.id, patientId);
        if (winner) return { measurement: this.toDto(winner), created: false };
        // L'identifiant appartient à un AUTRE patient (collision ou tentative) : refus neutre.
        throw new BadRequestException({
          message: 'Données invalides',
          issues: [{ path: 'id', message: 'Identifiant déjà utilisé : générez-en un nouveau.' }],
        });
      }
      // P2003 = clé étrangère : pas de profil médical (ou compte supprimé, jeton encore valable).
      if (hasCode(error, 'P2003')) throw await this.noProfile(patientId);
      throw error;
    }
  }

  // ------------------------------------------------------------------ liste

  /**
   * GET /measurements : mesures de la période [from ; to[, de la plus récente à la plus ancienne,
   * suppressions exclues. Pagination par curseur (stable même si des mesures sont ajoutées entre deux pages).
   */
  async list(patientId: string, query: ListQuery): Promise<MeasurementList> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.measurement.findMany({
      where: {
        patientId,
        deletedAt: null,
        measuredAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lt: new Date(query.to) } : {}),
        },
        // Page suivante : strictement « après » la dernière mesure de la page précédente (date, puis id).
        ...(after
          ? {
              OR: [
                { measuredAt: { lt: after.measuredAt } },
                { measuredAt: after.measuredAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1, // une de plus : savoir s'il existe une page suivante
      select: SELECT,
    });

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => this.toDto(row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  // ------------------------------------------------------------------ modification

  /** PUT /measurements/:id : seuls les champs envoyés changent ; `editedAt` est renseigné. */
  async update(
    patientId: string,
    id: string,
    input: UpdateMeasurementInput,
  ): Promise<MeasurementDto> {
    const current = await this.findOwned(id, patientId);
    if (!current || current.deletedAt) throw notFound();

    const now = new Date();
    const data: Record<string, unknown> = {};
    if (input.value !== undefined && input.unit !== undefined) {
      data.valueMgDl = this.checkValue(input.value, input.unit, input.confirmedUnusual ?? false);
      data.originalValue = input.value;
      data.originalUnit = input.unit;
    }
    if (input.measuredAt !== undefined) data.measuredAt = this.checkDate(input.measuredAt, now);
    if (input.context !== undefined) data.context = input.context;
    // Note : texte vide = note effacée.
    if (input.note !== undefined) data.noteEncrypted = this.encryptNote(input.note);

    // Rien à changer (corps vide, ou seulement confirmedUnusual) : on renvoie la mesure telle quelle.
    if (Object.keys(data).length === 0) return this.toDto(current);

    // Condition « non supprimée » DANS l'écriture : une suppression simultanée gagne (pas de résurrection).
    const changed = await this.prisma.measurement.updateMany({
      where: { id, patientId, deletedAt: null },
      data: { ...data, editedAt: now, clientUpdatedAt: now },
    });
    if (changed.count === 0) throw notFound();

    const updated = await this.findOwned(id, patientId);
    if (!updated) throw notFound();
    return this.toDto(updated);
  }

  // ------------------------------------------------------------------ suppression

  /**
   * DELETE /measurements/:id : tombstone (`deletedAt`), la note est effacée tout de suite.
   * Idempotent : 204 même si la mesure était déjà supprimée ; 404 si elle n'existe pas (ou pas à moi).
   */
  async remove(patientId: string, id: string): Promise<void> {
    const now = new Date();
    const removed = await this.prisma.measurement.updateMany({
      where: { id, patientId, deletedAt: null },
      data: { deletedAt: now, noteEncrypted: null, clientUpdatedAt: now },
    });
    if (removed.count === 1) return;
    const existing = await this.findOwned(id, patientId);
    if (!existing) throw notFound(); // déjà supprimée : rien à faire (204)
  }

  // ------------------------------------------------------------------ outils

  /** La mesure si elle appartient à ce patient (supprimée ou non) ; sinon null. */
  private async findOwned(id: string, patientId: string): Promise<Row | null> {
    const row = await this.prisma.measurement.findUnique({ where: { id }, select: SELECT });
    return row && row.patientId === patientId ? row : null;
  }

  /** Date ISO avec fuseau → Date ; refusée si plus de 5 minutes dans le futur. */
  private checkDate(iso: string, now: Date): Date {
    const date = new Date(iso);
    if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException({
        message: 'Données invalides',
        issues: [{ path: 'measuredAt', message: 'La date de la mesure est dans le futur.' }],
      });
    }
    return date;
  }

  /** Conversion en mg/dL entier ; valeur hors bornes refusée sans confirmation (422 UNUSUAL_VALUE). */
  private checkValue(value: number, unit: GlucoseUnit, confirmed: boolean): number {
    const mgDl = toMgDl(value, unit);
    if (!isPlausibleMgDl(mgDl) && !confirmed) {
      throw new UnprocessableEntityException({
        message: UNUSUAL_VALUE_MESSAGE,
        code: 'UNUSUAL_VALUE',
        valueMgDl: mgDl,
        plausibleMinMgDl: PLAUSIBLE_MIN_MG_DL,
        plausibleMaxMgDl: PLAUSIBLE_MAX_MG_DL,
      });
    }
    // Même confirmée, une valeur doit tenir dans une colonne entière raisonnable.
    if (mgDl < 1 || mgDl > 5000) {
      throw new BadRequestException({
        message: 'Données invalides',
        issues: [{ path: 'value', message: 'Valeur impossible.' }],
      });
    }
    return mgDl;
  }

  private encryptNote(note: string | undefined): string | null {
    const text = note?.trim();
    if (!text) return null;
    return encryptField(text, this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY'));
  }

  private toDto(row: Row): MeasurementDto {
    let note: string | null = null;
    if (row.noteEncrypted) {
      try {
        note = decryptField(
          row.noteEncrypted,
          this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY'),
        );
      } catch {
        this.logger.warn('Note illisible ignorée.'); // jamais le contenu ni l'identifiant
      }
    }
    return {
      id: row.id,
      valueMgDl: row.valueMgDl,
      originalValue: row.originalValue,
      originalUnit: row.originalUnit,
      measuredAt: row.measuredAt.toISOString(),
      context: row.context,
      source: row.source,
      importBatchId: row.importBatchId,
      note,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
  }

  /** Pas de profil médical : compte supprimé (jeton encore valable) ⇒ 401, sinon 400 explicite. */
  private async noProfile(patientId: string): Promise<Error> {
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    return new BadRequestException({
      message: 'Complétez votre profil médical avant d’enregistrer des mesures.',
    });
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({ message: 'Mesure introuvable.' });
}

// Curseur opaque : date + identifiant de la dernière mesure de la page, en base64url.
function encodeCursor(row: { measuredAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([row.measuredAt.toISOString(), row.id])).toString('base64url');
}

function decodeCursor(cursor: string): { measuredAt: Date; id: string } {
  try {
    const [iso, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown[];
    const measuredAt = new Date(String(iso));
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(id) ||
      Number.isNaN(measuredAt.getTime())
    ) {
      throw new Error('curseur');
    }
    return { measuredAt, id };
  } catch {
    throw new BadRequestException({
      message: 'Données invalides',
      issues: [
        { path: 'cursor', message: 'Curseur invalide : recommencez depuis la première page.' },
      ],
    });
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
