// Import CSV / Excel (L4-04, CDC F5) : aperçu, import après décisions, annulation d'un lot.
//
// Parcours :
//  1. POST /imports/preview : lecture du fichier (L4-01, L4-02), validation (L4-03) avec les mesures DÉJÀ
//     enregistrées du patient (doublons), puis création d'un lot PREVIEW qui garde les lignes validées.
//     RIEN n'est écrit dans les mesures. Rapport : comptes + détail des lignes non valides.
//  2. POST /imports/:id/commit : décisions du patient (Corriger / Ignorer / Accepter), puis création des
//     mesures (source IMPORT, `importBatchId`) ET passage du lot à COMMITTED dans UNE transaction. Un lot
//     ne s'importe qu'une fois (409 IMPORT_ALREADY_COMMITTED), même avec deux envois simultanés.
//  3. DELETE /imports/:id : annulation : toutes les mesures du lot deviennent des tombstones (`deletedAt`),
//     pour que la synchronisation propage la suppression aux téléphones.
//
// Sans décision : valides importées ; doublons, incohérentes et rejetées ignorées (contrat).
// PROPRIÉTÉ : le patient vient TOUJOURS du jeton ; le lot d'un autre patient est « introuvable » (404).
// Aucune donnée de santé ni nom de fichier dans les journaux.
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  UNIT_LABELS,
  isPlausibleMgDl,
  toMgDl,
  type GlucoseUnit,
  type ImportReport,
  type ImportRowReport,
  type importCommitSchema,
  type importPreviewFormSchema,
} from '@glyka/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { invalidField, notFound } from '../../common/data/owned-records';
import { UNAUTHORIZED_MESSAGE } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCsv } from './csv-parser';
import { ImportFileError, type ImportTable } from './import-table';
import {
  REASON_MESSAGES,
  duplicateKey,
  validateRows,
  type ValidatedRow,
} from './import-validation';
import { parseXlsx } from './xlsx-parser';

export type ImportPreviewForm = z.output<typeof importPreviewFormSchema>;
export type ImportCommitInput = z.output<typeof importCommitSchema>;

/** Fichier reçu (multipart) : seuls ces champs sont utilisés. */
export interface UploadedImportFile {
  originalname: string;
  buffer: Buffer;
}

export interface ImportCommitResult {
  batchId: string;
  imported: number;
  skipped: number;
}

export interface ImportRevertResult {
  reverted: number;
}

/** Durée de vie d'un aperçu : au-delà, les doublons ont pu changer ; le patient relance l'analyse. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
/** Nom de fichier gardé (affichage seulement) : sans dossier ni caractère de contrôle, 120 caractères. */
const FILE_NAME_MAX = 120;

export const ALREADY_COMMITTED_MESSAGE = 'Ce lot a déjà été importé ou annulé.';
export const PREVIEW_EXPIRED_MESSAGE = 'Aperçu expiré : relancez l’analyse du fichier.';

/** Signature d'un ZIP (.xlsx) et d'un fichier OLE (ancien .xls, classeur protégé). */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

/**
 * Excel ou CSV ? D'après le CONTENU d'abord (un .xlsx est un ZIP, un .xls un fichier OLE), puis d'après le
 * nom : un fichier « .xlsx » qui n'est pas un ZIP sera signalé « classeur illisible », pas lu comme du CSV.
 */
export function isSpreadsheet(file: UploadedImportFile): boolean {
  const bytes = file.buffer;
  if (startsWith(bytes, ZIP_SIGNATURE) || startsWith(bytes, OLE_SIGNATURE)) return true;
  return /\.xlsx?$/i.test(file.originalname);
}

/** Nom de fichier affichable : dernier segment, sans caractère de contrôle, tronqué. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'fichier').slice(0, FILE_NAME_MAX);
}

/** Message du rapport : la raison, et pour une valeur hors bornes l'unité qui aurait du sens. */
export function rowMessage(row: ValidatedRow): string | undefined {
  if (!row.reason) return undefined;
  const message = REASON_MESSAGES[row.reason];
  const units = row.suggestedUnits ?? [];
  if (row.reason !== 'OUT_OF_RANGE' || units.length === 0) return message;
  return `${message} (en ${units.map((u) => UNIT_LABELS[u]).join(' ou ')} ?)`;
}

/** Erreur sur le fichier entier ⇒ réponse HTTP : 413 si trop gros, sinon 400 sur le champ `file`. */
function fileError(error: ImportFileError): Error {
  if (error.code === 'TOO_LARGE' || error.code === 'TOO_MANY_ROWS') {
    return new PayloadTooLargeException({
      message: `${error.message}. Limites : ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} Mo et ${IMPORT_MAX_ROWS} lignes.`,
    });
  }
  return invalidField(error.code === 'UNKNOWN_COLUMN' ? 'mapping' : 'file', error.message);
}

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ aperçu

  /** POST /imports/preview */
  async preview(
    patientId: string,
    file: UploadedImportFile,
    form: ImportPreviewForm,
    now = new Date(),
  ): Promise<ImportReport> {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId: patientId },
      select: { timezoneOffsetMinutes: true },
    });
    if (!profile) throw await this.noProfile(patientId);

    let table: ImportTable;
    try {
      const bytes = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.length);
      table = isSpreadsheet(file)
        ? await parseXlsx(bytes, form.mapping)
        : parseCsv(bytes, form.mapping);
    } catch (error) {
      if (error instanceof ImportFileError) throw fileError(error);
      throw error;
    }

    const options = {
      defaultUnit: form.defaultUnit,
      timezoneOffsetMinutes: profile.timezoneOffsetMinutes,
      now,
      existing: new Set<string>(),
    };
    // 1er passage : les instants du fichier ; on lit ensuite les mesures déjà enregistrées SUR CETTE
    // PÉRIODE seulement (une minute de marge de chaque côté), puis on valide pour de bon.
    const instants = validateRows(table, options)
      .rows.map((row) => (row.measuredAt ? Date.parse(row.measuredAt) : NaN))
      .filter((at) => !Number.isNaN(at));
    if (instants.length > 0) {
      const stored = await this.prisma.measurement.findMany({
        where: {
          patientId,
          deletedAt: null,
          measuredAt: {
            gte: new Date(Math.min(...instants) - 60_000),
            lte: new Date(Math.max(...instants) + 60_000),
          },
        },
        select: { measuredAt: true, valueMgDl: true },
      });
      for (const m of stored) options.existing.add(duplicateKey(m.measuredAt, m.valueMgDl));
    }
    const summary = validateRows(table, options);

    // Les aperçus abandonnés depuis plus de 24 h sont effacés (ils gardent des valeurs de santé).
    await this.prisma.importBatch.deleteMany({
      where: {
        patientId,
        status: 'PREVIEW',
        createdAt: { lt: new Date(now.getTime() - PREVIEW_TTL_MS) },
      },
    });
    const batch = await this.prisma.importBatch.create({
      data: {
        patientId,
        fileName: cleanFileName(file.originalname),
        status: 'PREVIEW',
        defaultUnit: form.defaultUnit,
        parsedRows: summary.rows as unknown as Prisma.InputJsonValue,
        validCount: summary.valid,
        duplicateCount: summary.duplicates,
        inconsistentCount: summary.inconsistent,
        errorCount: summary.errors,
      },
      select: { id: true },
    });

    return {
      batchId: batch.id,
      analyzed: summary.analyzed,
      valid: summary.valid,
      duplicates: summary.duplicates,
      inconsistent: summary.inconsistent,
      errors: summary.errors,
      rows: summary.rows
        .filter((row) => row.status !== 'VALID')
        .map((row): ImportRowReport => {
          const message = rowMessage(row);
          return {
            line: row.line,
            status: row.status,
            rawValue: row.rawValue,
            ...(message ? { message } : {}),
          };
        }),
    };
  }

  // ------------------------------------------------------------------ import

  /** POST /imports/:id/commit */
  async commit(
    patientId: string,
    batchId: string,
    input: ImportCommitInput,
    now = new Date(),
  ): Promise<ImportCommitResult> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, patientId },
      select: { status: true, createdAt: true, defaultUnit: true, parsedRows: true },
    });
    if (!batch) throw notFound('Lot d’import introuvable.');
    if (batch.status !== 'PREVIEW') throw alreadyCommitted();
    if (now.getTime() - batch.createdAt.getTime() > PREVIEW_TTL_MS) {
      throw new ConflictException({ message: PREVIEW_EXPIRED_MESSAGE });
    }

    const rows = batch.parsedRows as unknown as ValidatedRow[];
    const toImport = planImport(rows, input, batch.defaultUnit);

    await this.prisma.$transaction(async (tx) => {
      // Le lot est « pris » D'ABORD, sous condition PREVIEW : un 2e envoi simultané ne trouve plus rien
      // à prendre et échoue (409) sans rien créer. Les lignes analysées sont effacées (plus utiles).
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, patientId, status: 'PREVIEW' },
        data: { status: 'COMMITTED', committedAt: now, parsedRows: [] },
      });
      if (claimed.count === 0) throw alreadyCommitted();
      if (toImport.length === 0) return;
      await tx.measurement.createMany({
        data: toImport.map((m) => ({
          id: randomUUID(),
          patientId,
          valueMgDl: m.valueMgDl,
          originalValue: m.originalValue,
          originalUnit: m.originalUnit,
          measuredAt: new Date(m.measuredAt),
          context: m.context,
          source: 'IMPORT' as const,
          importBatchId: batchId,
          clientUpdatedAt: now,
        })),
      });
    });

    return { batchId, imported: toImport.length, skipped: rows.length - toImport.length };
  }

  // ------------------------------------------------------------------ annulation

  /**
   * DELETE /imports/:id : les mesures du lot deviennent des tombstones (y compris celles modifiées depuis).
   * Idempotent : un lot déjà annulé renvoie `reverted: 0`. Un aperçu (PREVIEW) est simplement abandonné.
   */
  async revert(patientId: string, batchId: string, now = new Date()): Promise<ImportRevertResult> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, patientId },
      select: { id: true },
    });
    if (!batch) throw notFound('Lot d’import introuvable.');

    return this.prisma.$transaction(async (tx) => {
      // Le lot est pris dans TOUT état sauf « déjà annulé » : une annulation qui croise un import en cours
      // supprime aussi ses mesures (l'import est passé avant) ou le bloque (409 : l'annulation est passée
      // avant). Déjà annulé : rien à faire, et la date d'annulation d'origine est gardée.
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, patientId, status: { not: 'REVERTED' } },
        data: { status: 'REVERTED', revertedAt: now, parsedRows: [] },
      });
      if (claimed.count === 0) return { reverted: 0 };
      const removed = await tx.measurement.updateMany({
        where: { importBatchId: batchId, patientId, deletedAt: null },
        data: { deletedAt: now, noteEncrypted: null, clientUpdatedAt: now },
      });
      return { reverted: removed.count };
    });
  }

  // ------------------------------------------------------------------ outils

  /** Pas de profil médical : compte supprimé (jeton encore valable) ⇒ 401, sinon 400 explicite. */
  private async noProfile(patientId: string): Promise<Error> {
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!user) return new UnauthorizedException({ message: UNAUTHORIZED_MESSAGE });
    return new BadRequestException({
      message: 'Complétez votre profil médical avant d’importer des mesures.',
    });
  }
}

function alreadyCommitted() {
  return new ConflictException({
    message: ALREADY_COMMITTED_MESSAGE,
    code: 'IMPORT_ALREADY_COMMITTED',
  });
}

/** Mesure à créer au commit. */
interface PlannedMeasurement {
  measuredAt: string;
  valueMgDl: number;
  originalValue: number;
  originalUnit: GlucoseUnit;
  context: ValidatedRow['context'];
}

/**
 * Applique les décisions aux lignes analysées ⇒ mesures à créer. Une décision impossible ⇒ 400 sur
 * `decisions.<i>` (rien n'est importé) :
 *  - ligne absente du fichier ;
 *  - ACCEPTER une ligne rejetée (rien à importer : il faut la corriger ou l'ignorer) ;
 *  - CORRIGER une ligne sans date lisible, ou avec une valeur corrigée encore hors des bornes.
 */
export function planImport(
  rows: readonly ValidatedRow[],
  input: ImportCommitInput,
  defaultUnit: GlucoseUnit,
): PlannedMeasurement[] {
  const byLine = new Map(rows.map((row) => [row.line, row]));
  const decided = new Map<number, ImportCommitInput['decisions'][number]>();
  input.decisions.forEach((decision, i) => {
    const row = byLine.get(decision.line);
    if (!row) throw invalidField(`decisions.${i}.line`, 'Ligne absente du fichier analysé.');
    if (decision.action === 'ACCEPT' && row.status === 'ERROR') {
      throw invalidField(
        `decisions.${i}.action`,
        'Ligne rejetée : corrigez la valeur ou ignorez la ligne.',
      );
    }
    if (decision.action === 'CORRECT') {
      if (!row.measuredAt) {
        throw invalidField(
          `decisions.${i}.action`,
          'Date ou heure illisible : corrigez le fichier puis relancez l’analyse.',
        );
      }
      const unit = decision.correctedUnit ?? defaultUnit;
      if (!isPlausibleMgDl(toMgDl(decision.correctedValue ?? 0, unit))) {
        throw invalidField(
          `decisions.${i}.correctedValue`,
          'Valeur corrigée hors des bornes plausibles (20 à 600 mg/dL).',
        );
      }
    }
    decided.set(decision.line, decision);
  });

  const planned: PlannedMeasurement[] = [];
  for (const row of rows) {
    const decision = decided.get(row.line);
    const action = decision?.action ?? (row.status === 'VALID' ? 'ACCEPT' : 'IGNORE');
    if (action === 'IGNORE' || !row.measuredAt) continue;
    if (action === 'CORRECT' && decision?.correctedValue !== undefined) {
      const unit = decision.correctedUnit ?? defaultUnit;
      planned.push({
        measuredAt: row.measuredAt,
        valueMgDl: toMgDl(decision.correctedValue, unit),
        originalValue: decision.correctedValue,
        originalUnit: unit,
        context: row.context,
      });
      continue;
    }
    if (row.valueMgDl === undefined || row.originalValue === undefined || !row.originalUnit)
      continue;
    planned.push({
      measuredAt: row.measuredAt,
      valueMgDl: row.valueMgDl,
      originalValue: row.originalValue,
      originalUnit: row.originalUnit,
      context: row.context,
    });
  }
  return planned;
}
