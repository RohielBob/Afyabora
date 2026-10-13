// Tests du ticket L4-04 : routes de l'import (POST /imports/preview, POST /imports/:id/commit,
// DELETE /imports/:id). Vrai serveur HTTP (port 0), vrai envoi multipart, vraies gardes JWT et rôles ;
// base SIMULÉE en mémoire qui applique réellement les filtres (patient, supprimées, période, statut) et
// les transactions (tout ou rien).
import {
  BadRequestException,
  type INestApplication,
  PayloadTooLargeException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  importColumnsErrorSchema,
  importCommitResponseSchema,
  importRevertResponseSchema,
} from '@glyka/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ImportsModule } from '../src/modules/imports/imports.module';
import {
  ALREADY_COMMITTED_MESSAGE,
  PREVIEW_EXPIRED_MESSAGE,
  PREVIEW_TTL_MS,
  cleanFileName,
  isSpreadsheet,
} from '../src/modules/imports/imports.service';
import { translateUploadError } from '../src/modules/imports/upload-errors.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const SAMPLES = join(__dirname, '..', '..', '..', 'scripts', 'sample-data');
const DEMO = readFileSync(join(SAMPLES, 'import-demo-147.csv'));
const HOUR = 60 * 60 * 1000;

// ---------- Fausse base ----------
interface Measurement {
  id: string;
  patientId: string;
  valueMgDl: number;
  originalValue: number;
  originalUnit: string;
  measuredAt: Date;
  context: string;
  source: string;
  importBatchId: string | null;
  noteEncrypted: string | null;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
}
interface Batch {
  id: string;
  patientId: string;
  fileName: string;
  status: string;
  defaultUnit: string;
  parsedRows: unknown;
  validCount: number;
  duplicateCount: number;
  inconsistentCount: number;
  errorCount: number;
  createdAt: Date;
  committedAt: Date | null;
  revertedAt: Date | null;
}

let measurements: Measurement[] = [];
let batches: Batch[] = [];
let users = new Set<string>();
let profiles = new Map<string, number>();
/** Fait échouer la prochaine création de mesures (vérifie le « tout ou rien » de la transaction). */
let failCreateMany = false;
/** S'exécute juste avant de prendre le lot (reproduit deux envois simultanés). */
let beforeClaim: (() => Promise<void>) | null = null;
/** Journal d'annulation de la transaction en cours (null hors transaction). */
let undoLog: (() => void)[] | null = null;
/** Annulation d'une modification : remet l'objet tel qu'il était. */
const restore =
  <T extends object>(target: T, old: T) =>
  () => {
    Object.assign(target, old);
  };

type MeasurementWhere = {
  patientId?: string;
  deletedAt?: null;
  importBatchId?: string;
  measuredAt?: { gte?: Date; lte?: Date };
};
const matchMeasurement = (m: Measurement, w: MeasurementWhere) =>
  (w.patientId === undefined || m.patientId === w.patientId) &&
  (!('deletedAt' in w) || m.deletedAt === null) &&
  (w.importBatchId === undefined || m.importBatchId === w.importBatchId) &&
  (!w.measuredAt?.gte || m.measuredAt >= w.measuredAt.gte) &&
  (!w.measuredAt?.lte || m.measuredAt <= w.measuredAt.lte);

type BatchWhere = {
  id?: string;
  patientId?: string;
  status?: string | { not: string };
  createdAt?: { lt: Date };
};
const matchStatus = (status: string, wanted: BatchWhere['status']) =>
  wanted === undefined || (typeof wanted === 'string' ? status === wanted : status !== wanted.not);
const matchBatch = (b: Batch, w: BatchWhere) =>
  (w.id === undefined || b.id === w.id) &&
  (w.patientId === undefined || b.patientId === w.patientId) &&
  matchStatus(b.status, w.status) &&
  (!w.createdAt || b.createdAt < w.createdAt.lt);

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users.has(where.id) ? { id: where.id } : null,
  },
  patientProfile: {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      profiles.has(where.userId)
        ? { timezoneOffsetMinutes: profiles.get(where.userId) ?? 60 }
        : null,
  },
  measurement: {
    findMany: async ({ where }: { where: MeasurementWhere }) =>
      measurements
        .filter((m) => matchMeasurement(m, where))
        .map((m) => ({ measuredAt: m.measuredAt, valueMgDl: m.valueMgDl })),
    createMany: async ({ data }: { data: Omit<Measurement, 'noteEncrypted' | 'deletedAt'>[] }) => {
      if (failCreateMany) {
        failCreateMany = false;
        throw new Error('panne simulée de la base');
      }
      measurements.push(...data.map((d) => ({ ...d, noteEncrypted: null, deletedAt: null })));
      const ids = new Set(data.map((d) => d.id));
      undoLog?.push(() => {
        measurements = measurements.filter((m) => !ids.has(m.id));
      });
      return { count: data.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: MeasurementWhere;
      data: Partial<Measurement>;
    }) => {
      const targets = measurements.filter((m) => matchMeasurement(m, where));
      undoLog?.push(...targets.map((m) => restore(m, { ...m })));
      targets.forEach((m) => Object.assign(m, data));
      return { count: targets.length };
    },
  },
  importBatch: {
    create: async ({
      data,
    }: {
      data: Omit<Batch, 'id' | 'createdAt' | 'committedAt' | 'revertedAt'>;
    }) => {
      const batch: Batch = {
        ...data,
        id: randomUUID(),
        createdAt: new Date(),
        committedAt: null,
        revertedAt: null,
      };
      batches.push(batch);
      return { id: batch.id };
    },
    findFirst: async ({ where }: { where: BatchWhere }) => {
      const batch = batches.find((b) => matchBatch(b, where));
      return batch ? structuredClone(batch) : null;
    },
    updateMany: async ({ where, data }: { where: BatchWhere; data: Partial<Batch> }) => {
      const pause = beforeClaim;
      if (pause) {
        beforeClaim = null;
        await pause();
      }
      const targets = batches.filter((b) => matchBatch(b, where));
      undoLog?.push(...targets.map((b) => restore(b, { ...b })));
      targets.forEach((b) => Object.assign(b, data));
      return { count: targets.length };
    },
    deleteMany: async ({ where }: { where: BatchWhere }) => {
      const before = batches.length;
      batches = batches.filter((b) => !matchBatch(b, where));
      return { count: before - batches.length };
    },
  },
  /**
   * Transaction : en cas d'erreur, SES écritures (et seulement elles) sont annulées, comme dans
   * PostgreSQL. Une autre transaction terminée entre-temps garde les siennes.
   */
  $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
    const log: (() => void)[] = [];
    const previous = undoLog;
    undoLog = log;
    try {
      return await work(fakePrisma);
    } catch (error) {
      log.reverse().forEach((undo) => undo());
      throw error;
    } finally {
      undoLog = previous;
    }
  },
};
class FakeInfraModule {}

describe('L4-04 : routes de l’import (/imports)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  /** Envoi multipart, comme le téléphone (FormData + fichier). */
  const preview = (
    file: { bytes: Uint8Array | Buffer; name: string } | null,
    fields: Record<string, string> = { defaultUnit: 'G_L' },
    who: string | null = token(awa),
  ) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (file) form.append('file', new Blob([new Uint8Array(file.bytes)]), file.name);
    return fetch(`${baseUrl}/imports/preview`, {
      method: 'POST',
      headers: who ? { authorization: `Bearer ${who}` } : {},
      body: form,
    });
  };
  const demo = (who = token(awa)) =>
    preview({ bytes: DEMO, name: 'import-demo-147.csv' }, { defaultUnit: 'G_L' }, who);
  const call = (method: string, path: string, who: string | null, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const commit = (id: string, body: unknown = {}, who = token(awa)) =>
    call('POST', `/imports/${id}/commit`, who, body);
  const revert = (id: string, who = token(awa)) => call('DELETE', `/imports/${id}`, who);
  const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;
  const batchIdOf = async (res: Response) => (await json<{ batchId: string }>(res)).batchId;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [{ provide: PrismaService, useValue: fakePrisma }],
          exports: [PrismaService],
        },
        ImportsModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    measurements = [];
    batches = [];
    users = new Set([awa, paul]);
    profiles = new Map([
      [awa, 60],
      [paul, 60],
    ]);
    failCreateMany = false;
    beforeClaim = null;
  });

  // ---------------------------------------------------------------------------------------------
  describe('POST /imports/preview', () => {
    it('fichier de démo : rapport 139 / 5 / 3, lignes non valides détaillées, RIEN d’importé', async () => {
      const res = await demo();
      const report = await json<{
        batchId: string;
        rows: { line: number; status: string; rawValue: string; message?: string }[];
      }>(res);

      expect(res.status).toBe(200);
      expect(report).toMatchObject({
        analyzed: 147,
        valid: 139,
        duplicates: 5,
        inconsistent: 3,
        errors: 0,
      });
      expect(report.rows.map((r) => [r.line, r.status])).toEqual([
        [20, 'DUPLICATE'],
        [38, 'DUPLICATE'],
        [42, 'INCONSISTENT'],
        [65, 'DUPLICATE'],
        [90, 'INCONSISTENT'],
        [104, 'DUPLICATE'],
        [121, 'INCONSISTENT'],
        [138, 'DUPLICATE'],
      ]);
      expect(report.rows.find((r) => r.line === 42)).toEqual({
        line: 42,
        status: 'INCONSISTENT',
        rawValue: '18,70',
        message: "Valeur inhabituelle, vérifier l'unité (en mmol/L ?)",
      });
      expect(report.rows.find((r) => r.line === 90)?.message).toBe(
        "Valeur inhabituelle, vérifier l'unité",
      );
      expect(report.rows.find((r) => r.line === 20)?.message).toBe(
        'Ligne en double dans le fichier',
      );

      expect(measurements).toEqual([]); // rien n'est écrit dans les mesures avant le commit
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        id: report.batchId,
        patientId: awa,
        fileName: 'import-demo-147.csv',
        status: 'PREVIEW',
        defaultUnit: 'G_L',
        validCount: 139,
        duplicateCount: 5,
        inconsistentCount: 3,
        errorCount: 0,
      });
      expect(batches[0]?.parsedRows).toHaveLength(147);
    });

    it('classeur Excel (.xlsx corrompu) : 400 clair sur « file », aucun lot créé', async () => {
      const corrupted = readFileSync(join(SAMPLES, 'import-corrupted.xlsx'));
      const res = await preview({ bytes: corrupted, name: 'mesures.xlsx' });
      const body = await json<{ issues: { path: string; message: string }[] }>(res);

      expect(res.status).toBe(400);
      expect(body.issues).toEqual([
        { path: 'file', message: expect.stringContaining('Classeur Excel illisible') },
      ]);
      expect(batches).toEqual([]);
    });

    it('doublons avec les mesures DÉJÀ enregistrées : seulement les miennes, non supprimées', async () => {
      const line2 = new Date('2026-08-18T06:15:00Z'); // 18/08/2026 07:15 à Kinshasa, 0,92 g/L
      const stored = (patientId: string, deletedAt: Date | null = null): Measurement => ({
        id: randomUUID(),
        patientId,
        valueMgDl: 92,
        originalValue: 0.92,
        originalUnit: 'G_L',
        measuredAt: line2,
        context: 'FASTING',
        source: 'MANUAL',
        importBatchId: null,
        noteEncrypted: null,
        clientUpdatedAt: line2,
        deletedAt,
      });
      measurements = [stored(paul), stored(awa, new Date())];
      const before = await json<{ duplicates: number }>(await demo());
      expect(before.duplicates).toBe(5); // la mesure de Paul et la mesure supprimée ne comptent pas

      measurements.push(stored(awa));
      const after = await json<{
        duplicates: number;
        valid: number;
        rows: { line: number; message?: string }[];
      }>(await demo());
      expect([after.valid, after.duplicates]).toEqual([138, 6]);
      expect(after.rows.find((r) => r.line === 2)?.message).toBe(
        'Mesure déjà enregistrée (même date, même heure, même valeur)',
      );
    });

    it('mesure enregistrée dans la même minute que la DERNIÈRE ligne (secondes en plus) : doublon', async () => {
      measurements = [
        {
          id: randomUUID(),
          patientId: awa,
          valueMgDl: 110,
          originalValue: 1.1,
          originalUnit: 'G_L',
          measuredAt: new Date('2026-10-01T06:15:42Z'), // saisie à la main : secondes gardées
          context: 'OTHER',
          source: 'MANUAL',
          importBatchId: null,
          noteEncrypted: null,
          clientUpdatedAt: new Date(),
          deletedAt: null,
        },
      ];
      const csv = 'date;heure;valeur\n01/10/2026;06:00;1,3\n01/10/2026;07:15;1,1\n';
      const report = await json<{ duplicates: number }>(
        await preview({ bytes: Buffer.from(csv), name: 'a.csv' }),
      );
      expect(report.duplicates).toBe(1);
    });

    it('heure du fichier = heure locale du patient (décalage du profil)', async () => {
      profiles.set(awa, -300); // UTC-5
      const id = await batchIdOf(await demo());
      await commit(id);
      expect(measurements[0]?.measuredAt.toISOString()).toBe('2026-08-18T12:15:00.000Z');
    });

    it('champs invalides : fichier manquant, unité, correspondance (JSON ou colonne absente)', async () => {
      const issues = async (res: Response) =>
        (await json<{ issues: { path: string }[] }>(res)).issues.map((i) => i.path);

      const noFile = await preview(null);
      expect(noFile.status).toBe(400);
      expect(await issues(noFile)).toEqual(['file']);

      const unit = await preview({ bytes: DEMO, name: 'a.csv' }, { defaultUnit: 'KG' });
      expect(unit.status).toBe(400);
      expect(await issues(unit)).toEqual(['defaultUnit']);

      const badJson = await preview(
        { bytes: DEMO, name: 'a.csv' },
        { defaultUnit: 'G_L', mapping: '{' },
      );
      expect(badJson.status).toBe(400);
      expect(await issues(badJson)).toEqual(['mapping']);

      const unknown = await preview(
        { bytes: DEMO, name: 'a.csv' },
        { defaultUnit: 'G_L', mapping: JSON.stringify({ date: 'date', value: 'glycémie_mg' }) },
      );
      expect(unknown.status).toBe(400);
      expect(await issues(unknown)).toEqual(['mapping']);

      const noColumns = await preview({
        bytes: Buffer.from('Quand;Combien\n01/10/2026;1,1\n'),
        name: 'a.csv',
      });
      expect(noColumns.status).toBe(400);
      expect(await issues(noColumns)).toEqual(['file']);
      expect(batches).toEqual([]);
    });

    it('colonnes introuvables (0.4.1) : code IMPORT_COLUMNS_NOT_FOUND et liste des colonnes à choisir', async () => {
      const csv = Buffer.from('Quand;Combien;;Remarque\n01/10/2026 07:15;1,1;;sport\n');
      const res = await preview({ bytes: csv, name: 'a.csv' });
      const body = await json(res);

      expect(res.status).toBe(400);
      expect(importColumnsErrorSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        message: 'Colonnes de date ou de valeur introuvables',
        code: 'IMPORT_COLUMNS_NOT_FOUND',
        issues: [{ path: 'file', message: 'Colonnes de date ou de valeur introuvables' }],
        columns: ['Quand', 'Combien', 'Remarque'], // la colonne sans nom n'est pas proposée
      });

      // Le patient choisit parmi `columns` : l'aperçu passe.
      const chosen = await preview(
        { bytes: csv, name: 'a.csv' },
        { defaultUnit: 'G_L', mapping: JSON.stringify({ date: 'Quand', value: 'Combien' }) },
      );
      expect(chosen.status).toBe(200);

      // Colonne choisie absente du fichier : même code, sur « mapping », avec la liste à jour.
      const wrong = await preview(
        { bytes: csv, name: 'a.csv' },
        { defaultUnit: 'G_L', mapping: JSON.stringify({ date: 'Quand', value: 'Glycémie' }) },
      );
      expect(await json(wrong)).toMatchObject({
        code: 'IMPORT_COLUMNS_NOT_FOUND',
        issues: [{ path: 'mapping' }],
        columns: ['Quand', 'Combien', 'Remarque'],
      });

      // Les autres erreurs de fichier n'ont ni ce code ni de liste.
      const corrupted = await json(
        await preview({
          bytes: readFileSync(join(SAMPLES, 'import-corrupted.xlsx')),
          name: 'm.xlsx',
        }),
      );
      expect(corrupted).not.toHaveProperty('code');
      expect(corrupted).not.toHaveProperty('columns');
    });

    it('formulaire mal formé (2 fichiers, mauvais nom de champ) ⇒ 400 en français sur « file »', async () => {
      const send = async (form: FormData) => {
        const res = await fetch(`${baseUrl}/imports/preview`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token(awa)}` },
          body: form,
        });
        return { status: res.status, body: await json<{ issues: unknown[] }>(res) };
      };
      const expected = {
        status: 400,
        body: {
          message: 'Données invalides',
          issues: [
            {
              path: 'file',
              message: 'Envoyez un seul fichier .csv ou .xlsx, dans le champ « file ».',
            },
          ],
        },
      };
      const two = new FormData();
      two.append('defaultUnit', 'G_L');
      two.append('file', new Blob([DEMO]), 'a.csv');
      two.append('file', new Blob([DEMO]), 'b.csv');
      expect(await send(two)).toEqual(expected);

      const wrongField = new FormData();
      wrongField.append('defaultUnit', 'G_L');
      wrongField.append('fichier', new Blob([DEMO]), 'a.csv');
      expect(await send(wrongField)).toEqual(expected);
      expect(batches).toEqual([]);
    });

    it('correspondance donnée par le patient : utilisée', async () => {
      const csv = 'Quand;Combien\n01/10/2026 07:15;1,1\n';
      const res = await preview(
        { bytes: Buffer.from(csv), name: 'a.csv' },
        { defaultUnit: 'G_L', mapping: JSON.stringify({ date: 'Quand', value: 'Combien' }) },
      );
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ analyzed: 1, valid: 1 });
    });

    it(`plus de ${IMPORT_MAX_FILE_BYTES} octets ⇒ 413 (refusé à la réception) ; plus de ${IMPORT_MAX_ROWS} lignes ⇒ 413`, async () => {
      const big = await preview({
        bytes: new Uint8Array(IMPORT_MAX_FILE_BYTES + 1),
        name: 'a.csv',
      });
      expect(big.status).toBe(413);
      // Message de multer (« File too large ») traduit, au format du projet.
      expect(await json(big)).toEqual({
        message: 'Fichier trop volumineux (maximum 5 Mo).',
      });

      const lines = [
        'date;heure;valeur',
        ...Array(IMPORT_MAX_ROWS + 1).fill('01/10/2026;07:15;1,1'),
      ];
      const many = await preview({ bytes: Buffer.from(lines.join('\n')), name: 'a.csv' });
      const body = await json<{ message: string }>(many);
      expect(many.status).toBe(413);
      expect(body.message).toContain('5000 lignes');
      expect(batches).toEqual([]);
    });

    it('jeton absent ⇒ 401 ; médecin ⇒ 403 ; sans profil médical ⇒ 400 ; compte supprimé ⇒ 401', async () => {
      expect((await demo(null as unknown as string)).status).toBe(401);
      expect((await demo(token(awa, 'DOCTOR'))).status).toBe(403);
      profiles.delete(awa);
      const noProfile = await demo();
      expect(noProfile.status).toBe(400);
      expect((await json<{ message: string }>(noProfile)).message).toContain('profil médical');
      users.delete(awa);
      expect((await demo()).status).toBe(401);
      expect(batches).toEqual([]);
    });

    it('les aperçus abandonnés depuis plus de 24 h sont effacés (les miens seulement)', async () => {
      const old = new Date(Date.now() - PREVIEW_TTL_MS - HOUR);
      const make = (patientId: string, status: string, createdAt: Date): Batch => ({
        id: randomUUID(),
        patientId,
        fileName: 'ancien.csv',
        status,
        defaultUnit: 'G_L',
        parsedRows: [],
        validCount: 0,
        duplicateCount: 0,
        inconsistentCount: 0,
        errorCount: 0,
        createdAt,
        committedAt: null,
        revertedAt: null,
      });
      const oldPreview = make(awa, 'PREVIEW', old);
      const recentPreview = make(awa, 'PREVIEW', new Date(Date.now() - HOUR));
      const oldCommitted = make(awa, 'COMMITTED', old);
      const paulsOld = make(paul, 'PREVIEW', old);
      batches = [oldPreview, recentPreview, oldCommitted, paulsOld];

      const id = await batchIdOf(await demo());
      expect(batches.map((b) => b.id).sort()).toEqual(
        [recentPreview.id, oldCommitted.id, paulsOld.id, id].sort(),
      );
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('POST /imports/:id/commit', () => {
    it('sans décision : les 139 valides sont importées (source IMPORT, lot renseigné)', async () => {
      const id = await batchIdOf(await demo());
      const res = await commit(id);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toEqual({ batchId: id, imported: 139, skipped: 8 });
      // Même forme que celle que le mobile vérifie (L4-07).
      expect(importCommitResponseSchema.safeParse(body).success).toBe(true);
      expect(measurements).toHaveLength(139);
      expect(measurements[0]).toMatchObject({
        patientId: awa,
        valueMgDl: 92,
        originalValue: 0.92,
        originalUnit: 'G_L',
        measuredAt: new Date('2026-08-18T06:15:00.000Z'),
        context: 'FASTING',
        source: 'IMPORT',
        importBatchId: id,
      });
      expect(new Set(measurements.map((m) => m.id)).size).toBe(139);
      expect(measurements.every((m) => /^[0-9a-f-]{36}$/.test(m.id))).toBe(true);
      expect(batches[0]).toMatchObject({ status: 'COMMITTED', parsedRows: [] });
      expect(batches[0]?.committedAt).toBeInstanceOf(Date);
    });

    it('décisions : corriger la ligne 42, ignorer la 90, accepter la 121 et un doublon', async () => {
      const id = await batchIdOf(await demo());
      const res = await commit(id, {
        decisions: [
          { line: 42, action: 'CORRECT', correctedValue: 1.87 },
          { line: 90, action: 'IGNORE' },
          { line: 121, action: 'ACCEPT' },
          { line: 20, action: 'ACCEPT' },
          { line: 3, action: 'IGNORE' }, // une ligne valide peut aussi être ignorée
        ],
      });

      expect(await json(res)).toEqual({ batchId: id, imported: 141, skipped: 6 });
      const value = (mgDl: number) => measurements.filter((m) => m.valueMgDl === mgDl);
      expect(value(187)).toMatchObject([{ originalValue: 1.87, originalUnit: 'G_L' }]);
      expect(value(990)).toHaveLength(1); // ligne 121 acceptée telle quelle (9,9 g/L)
      expect(value(2)).toHaveLength(0); // ligne 90 ignorée (0,02 g/L)
    });

    it('corriger avec une autre unité : la ligne 42 était en mmol/L', async () => {
      const id = await batchIdOf(await demo());
      await commit(id, {
        decisions: [{ line: 42, action: 'CORRECT', correctedValue: 18.7, correctedUnit: 'MMOL_L' }],
      });
      expect(measurements.find((m) => m.originalUnit === 'MMOL_L')).toMatchObject({
        valueMgDl: 337,
        originalValue: 18.7,
      });
    });

    it('une ligne rejetée pour sa valeur peut être CORRIGÉE (pas acceptée)', async () => {
      const csv = 'date;heure;valeur\n01/10/2026;07:15;abc\n01/10/2026;12:00;1,2\n';
      const id = await batchIdOf(await preview({ bytes: Buffer.from(csv), name: 'a.csv' }));

      const accept = await commit(id, { decisions: [{ line: 2, action: 'ACCEPT' }] });
      expect(accept.status).toBe(400);
      expect((await json<{ issues: { path: string }[] }>(accept)).issues[0]?.path).toBe(
        'decisions.0.action',
      );

      const fixed = await commit(id, {
        decisions: [{ line: 2, action: 'CORRECT', correctedValue: 1.1 }],
      });
      expect(await json(fixed)).toMatchObject({ imported: 2, skipped: 0 });
      expect(measurements.map((m) => m.valueMgDl).sort()).toEqual([110, 120]);
    });

    it('décisions impossibles ⇒ 400 sur la bonne décision, RIEN d’importé, lot toujours en aperçu', async () => {
      const csv = 'date;heure;valeur\nhier;07:15;1,1\n01/10/2026;12:00;1,2\n';
      const id = await batchIdOf(await preview({ bytes: Buffer.from(csv), name: 'a.csv' }));
      const pathOf = async (body: unknown) => {
        const res = await commit(id, body);
        expect(res.status).toBe(400);
        return (await json<{ issues: { path: string }[] }>(res)).issues.map((i) => i.path);
      };

      expect(await pathOf({ decisions: [{ line: 99, action: 'IGNORE' }] })).toEqual([
        'decisions.0.line',
      ]);
      expect(
        await pathOf({
          decisions: [
            { line: 3, action: 'IGNORE' },
            { line: 2, action: 'CORRECT', correctedValue: 1.1 }, // date illisible : rien à corriger ici
          ],
        }),
      ).toEqual(['decisions.1.action']);
      expect(
        await pathOf({ decisions: [{ line: 3, action: 'CORRECT', correctedValue: 18.7 }] }),
      ).toEqual(['decisions.0.correctedValue']);
      // Règles du schéma partagé : correctedValue obligatoire, une seule décision par ligne.
      expect(await pathOf({ decisions: [{ line: 3, action: 'CORRECT' }] })).toEqual([
        'decisions.0.correctedValue',
      ]);
      expect(
        await pathOf({
          decisions: [
            { line: 3, action: 'IGNORE' },
            { line: 3, action: 'ACCEPT' },
          ],
        }),
      ).toEqual(['decisions']);

      expect(measurements).toEqual([]);
      expect(batches[0]?.status).toBe('PREVIEW');
    });

    it('un lot ne s’importe qu’une fois : 2e envoi ⇒ 409 IMPORT_ALREADY_COMMITTED', async () => {
      const id = await batchIdOf(await demo());
      expect((await commit(id)).status).toBe(200);
      const again = await commit(id);

      expect(again.status).toBe(409);
      expect(await json(again)).toMatchObject({
        message: ALREADY_COMMITTED_MESSAGE,
        code: 'IMPORT_ALREADY_COMMITTED',
      });
      expect(measurements).toHaveLength(139);
    });

    it('deux envois SIMULTANÉS : un seul importe, l’autre reçoit 409', async () => {
      const id = await batchIdOf(await demo());
      let second: Promise<Response> | null = null;
      // Le 2e envoi part pendant que le 1er s'apprête à prendre le lot (tous deux ont lu PREVIEW).
      beforeClaim = async () => {
        second = commit(id);
        await new Promise((resolve) => setTimeout(resolve, 50));
      };
      const first = await commit(id);
      const other = await (second as unknown as Promise<Response>);

      expect([first.status, other.status].sort()).toEqual([200, 409]);
      expect(measurements).toHaveLength(139);
    });

    it('panne pendant la création des mesures : tout est annulé, le lot reste à importer', async () => {
      const id = await batchIdOf(await demo());
      failCreateMany = true;
      expect((await commit(id)).status).toBe(500);
      expect(measurements).toEqual([]);
      expect(batches[0]?.status).toBe('PREVIEW');
      expect(batches[0]?.parsedRows).toHaveLength(147);

      expect((await commit(id)).status).toBe(200); // on peut réessayer
      expect(measurements).toHaveLength(139);
    });

    it('aperçu de plus de 24 h ⇒ 409 « relancez l’analyse »', async () => {
      const id = await batchIdOf(await demo());
      const batch = batches[0];
      if (batch) batch.createdAt = new Date(Date.now() - PREVIEW_TTL_MS - 1000);
      const res = await commit(id);
      expect(res.status).toBe(409);
      expect((await json<{ message: string }>(res)).message).toBe(PREVIEW_EXPIRED_MESSAGE);
      expect(measurements).toEqual([]);
    });

    it('lot d’un autre patient ou inconnu ⇒ 404 ; identifiant invalide ⇒ 400 ; médecin ⇒ 403', async () => {
      const id = await batchIdOf(await demo());
      expect((await commit(id, {}, token(paul))).status).toBe(404);
      expect((await commit(randomUUID())).status).toBe(404);
      expect((await commit('pas-un-uuid')).status).toBe(400);
      expect((await commit(id, {}, token(awa, 'DOCTOR'))).status).toBe(403);
      expect(measurements).toEqual([]);
      expect(batches[0]?.status).toBe('PREVIEW');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('DELETE /imports/:id', () => {
    it('annuler un lot supprime toutes ses mesures (tombstones), et seulement elles', async () => {
      const id = await batchIdOf(await demo());
      await commit(id);
      const manual: Measurement = {
        ...(measurements[0] as Measurement),
        id: randomUUID(),
        source: 'MANUAL',
        importBatchId: null,
      };
      const otherBatch: Measurement = { ...manual, id: randomUUID(), importBatchId: randomUUID() };
      measurements.push(manual, otherBatch);
      const edited = measurements[1];
      if (edited) edited.noteEncrypted = 'note-chiffrée';

      const res = await revert(id);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toEqual({ reverted: 139 });
      expect(importRevertResponseSchema.safeParse(body).success).toBe(true);

      const ofBatch = measurements.filter((m) => m.importBatchId === id);
      expect(ofBatch).toHaveLength(139);
      expect(ofBatch.every((m) => m.deletedAt instanceof Date && m.noteEncrypted === null)).toBe(
        true,
      );
      expect(manual.deletedAt).toBeNull();
      expect(otherBatch.deletedAt).toBeNull();
      expect(batches[0]).toMatchObject({ status: 'REVERTED' });
      expect(batches[0]?.revertedAt).toBeInstanceOf(Date);
    });

    it('déjà annulé ⇒ 200 { reverted: 0 } ; une mesure déjà supprimée n’est pas recomptée', async () => {
      const id = await batchIdOf(await demo());
      await commit(id);
      const first = measurements[0];
      if (first) first.deletedAt = new Date();
      expect(await json(await revert(id))).toEqual({ reverted: 138 });
      const revertedAt = batches[0]?.revertedAt;
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await json(await revert(id))).toEqual({ reverted: 0 });
      expect(batches[0]?.revertedAt).toBe(revertedAt); // date d'annulation d'origine gardée
    });

    it('annulation qui croise un import : l’import passé avant ⇒ ses mesures sont supprimées', async () => {
      const id = await batchIdOf(await demo());
      let importing: Promise<Response> | null = null;
      // L'annulation lit le lot (aperçu), puis l'import passe juste avant qu'elle ne prenne le lot.
      beforeClaim = async () => {
        importing = commit(id);
        await new Promise((resolve) => setTimeout(resolve, 50));
      };
      const reverted = await json(await revert(id));
      expect((await (importing as unknown as Promise<Response>)).status).toBe(200);
      expect(reverted).toEqual({ reverted: 139 });
      expect(measurements.every((m) => m.deletedAt instanceof Date)).toBe(true);
      expect(batches[0]?.status).toBe('REVERTED');
    });

    it('import qui croise une annulation : l’annulation passée avant ⇒ import refusé (409), rien créé', async () => {
      const id = await batchIdOf(await demo());
      let reverting: Promise<Response> | null = null;
      beforeClaim = async () => {
        reverting = revert(id);
        await new Promise((resolve) => setTimeout(resolve, 50));
      };
      const imported = await commit(id);
      expect(imported.status).toBe(409);
      expect(await json(await (reverting as unknown as Promise<Response>))).toEqual({
        reverted: 0,
      });
      expect(measurements).toEqual([]);
      expect(batches[0]?.status).toBe('REVERTED');
    });

    it('annuler un aperçu : abandonné (0 mesure), il ne peut plus être importé', async () => {
      const id = await batchIdOf(await demo());
      expect(await json(await revert(id))).toEqual({ reverted: 0 });
      expect(batches[0]).toMatchObject({ status: 'REVERTED', parsedRows: [] });
      expect((await commit(id)).status).toBe(409);
      expect(measurements).toEqual([]);
    });

    it('lot d’un autre patient ⇒ 404, rien ne change ; identifiant invalide ⇒ 400', async () => {
      const id = await batchIdOf(await demo());
      await commit(id);
      expect((await revert(id, token(paul))).status).toBe(404);
      expect((await revert('x')).status).toBe(400);
      expect(measurements.every((m) => m.deletedAt === null)).toBe(true);
      expect(batches[0]?.status).toBe('COMMITTED');
    });
  });
});

describe('traduction des refus de réception (multer)', () => {
  it('seuls les messages exacts de multer sont traduits ; les erreurs du service passent telles quelles', () => {
    const tooMany = new PayloadTooLargeException({ message: 'Trop de lignes (maximum 5000)' });
    expect(translateUploadError(tooMany)).toBe(tooMany);
    const ours = new BadRequestException({ message: 'Données invalides' });
    expect(translateUploadError(ours)).toBe(ours);
    const other = new Error('Unexpected field');
    expect(translateUploadError(other)).toBe(other);
    const translated = translateUploadError(new PayloadTooLargeException('File too large'));
    expect(translated).toBeInstanceOf(PayloadTooLargeException);
    expect((translated as PayloadTooLargeException).getResponse()).toEqual({
      message: 'Fichier trop volumineux (maximum 5 Mo).',
    });
    for (const message of [
      'Too many files',
      'Multipart: Boundary not found',
      'Field name missing',
    ]) {
      const result = translateUploadError(new BadRequestException(message)) as BadRequestException;
      expect(result.getResponse()).toMatchObject({ issues: [{ path: 'file' }] });
    }
  });
});

describe('outils du service', () => {
  it('Excel ou CSV : contenu d’abord, puis nom du fichier', () => {
    const file = (bytes: number[], name: string) => ({
      buffer: Buffer.from(bytes),
      originalname: name,
    });
    expect(isSpreadsheet(file([0x50, 0x4b, 0x03, 0x04], 'mesures.csv'))).toBe(true);
    expect(isSpreadsheet(file([0xd0, 0xcf, 0x11, 0xe0], 'mesures'))).toBe(true);
    expect(isSpreadsheet(file([0x64, 0x61], 'mesures.XLSX'))).toBe(true);
    expect(isSpreadsheet(file([0x64, 0x61], 'mesures.xls'))).toBe(true);
    expect(isSpreadsheet(file([0x64, 0x61], 'mesures.csv'))).toBe(false);
    expect(isSpreadsheet(file([0x50, 0x4b, 0x03], 'mesures.txt'))).toBe(false);
  });

  it('nom de fichier : sans dossier ni caractère de contrôle, tronqué, jamais vide', () => {
    expect(cleanFileName('C:\\Users\\Awa\\mesures.csv')).toBe('mesures.csv');
    expect(cleanFileName('../../etc/mesures.csv')).toBe('mesures.csv');
    expect(cleanFileName('mes\u0000ures\u001b.csv')).toBe('mesures.csv');
    expect(cleanFileName('a'.repeat(300))).toHaveLength(120);
    expect(cleanFileName('  ')).toBe('fichier');
    expect(cleanFileName('dossier/')).toBe('fichier');
  });
});
