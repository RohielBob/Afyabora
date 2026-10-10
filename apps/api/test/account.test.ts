// Tests du ticket L1-14 : GET /me/export (export de mes données) et DELETE /me (suppression du compte).
// Vrai serveur HTTP (port 0), vraies gardes JWT, rôles et limites par IP ; base de données SIMULÉE en
// mémoire, qui APPLIQUE les filtres (patient, éléments supprimés) comme le ferait PostgreSQL.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { INVALID_PASSWORD_MESSAGE } from '../src/modules/patients/account.service';
import { PatientsModule } from '../src/modules/patients/patients.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const FIELD_KEY = randomBytes(32).toString('base64');
const PASSWORD = 'un-mot-de-passe-solide-2026';

// ---------- Fausse base ----------
type Rec = Record<string, unknown>;
interface Db {
  users: { id: string; passwordHash: string }[];
  profiles: Map<string, Rec>;
  measurements: Rec[];
  events: Rec[];
  outbox: { id: string; userId: string }[];
}
const db: Db = { users: [], profiles: new Map(), measurements: [], events: [], outbox: [] };
let transactions = 0;

const pick = (row: Rec, select: Record<string, boolean>) =>
  Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));

/**
 * findMany avec where { patientId, deletedAt? }, orderBy { champ: 'asc' } et select. Comme une vraie base,
 * le filtre « deletedAt: null » n'est appliqué QUE si le code le demande (sinon les supprimés sortent aussi).
 */
function findMany(rows: Rec[]) {
  return async ({
    where,
    orderBy,
    select,
  }: {
    where: { patientId: string; deletedAt?: null };
    orderBy: Record<string, 'asc'>;
    select: Record<string, boolean>;
  }) => {
    const [field] = Object.keys(orderBy) as [string];
    return rows
      .filter(
        (r) => r.patientId === where.patientId && (!('deletedAt' in where) || r.deletedAt === null),
      )
      .sort((a, b) => (a[field] as Date).getTime() - (b[field] as Date).getTime())
      .map((r) => pick(r, select));
  };
}

/** Suppression du compte : comme PostgreSQL, la cascade emporte profil, mesures et événements. */
function deleteUser(id: string) {
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  db.profiles.delete(id);
  db.measurements = db.measurements.filter((m) => m.patientId !== id);
  db.events = db.events.filter((e) => e.patientId !== id);
  return { count: before - db.users.length };
}

const fakePrisma = {
  user: {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select: Record<string, boolean>;
    }) => {
      const u = db.users.find((row) => row.id === where.id);
      return u ? pick(u as unknown as Rec, select) : null;
    },
    deleteMany: async ({ where }: { where: { id: string } }) => deleteUser(where.id),
  },
  patientProfile: {
    findUnique: async ({
      where,
      select,
    }: {
      where: { userId: string };
      select: Record<string, boolean>;
    }) => {
      const row = db.profiles.get(where.userId);
      return row ? pick(row, select) : null;
    },
  },
  measurement: { findMany: findMany(db.measurements) },
  lifeEvent: { findMany: findMany(db.events) },
  notificationOutbox: {
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      const before = db.outbox.length;
      db.outbox = db.outbox.filter((n) => n.userId !== where.userId);
      return { count: before - db.outbox.length };
    },
  },
  // Tableau d'opérations : toutes appliquées ensemble (comme une transaction).
  $transaction: async (ops: Promise<unknown>[]) => {
    transactions += 1;
    return Promise.all(ops);
  },
};
// findMany lit les tableaux au moment de l'appel : on les rebranche après chaque remise à zéro.
function rebind() {
  fakePrisma.measurement.findMany = findMany(db.measurements);
  fakePrisma.lifeEvent.findMany = findMany(db.events);
}

const fakeConfig = {
  get: (key: string) => (key === 'FIELD_ENCRYPTION_KEY' ? FIELD_KEY : undefined),
  getOrThrow: (key: string) => {
    if (key === 'FIELD_ENCRYPTION_KEY') return FIELD_KEY;
    throw new Error(`Configuration absente du test : ${key}`);
  },
};
class FakeInfraModule {}

let passwordHash = '';
const at = (iso: string) => new Date(iso);

function addPatient(id = randomUUID()) {
  db.users.push({ id, passwordHash });
  db.profiles.set(id, {
    userId: id,
    firstName: 'Awa',
    lastName: 'Kabila',
    birthDate: at('1990-04-12T00:00:00Z'),
    sex: 'F',
    diabetesType: 'TYPE_2',
    diagnosisYear: 2019,
    preferredUnit: 'G_L',
    veryLowMgDl: 54,
    targetMinMgDl: 70,
    targetMaxMgDl: 180,
    veryHighMgDl: 250,
    thresholdsReviewedByClinician: false,
    emergencyContactName: 'Jean Kabila',
    emergencyContactPhone: '+243 900 000 000',
    emergencyContactRelation: 'Frère',
    doctorName: null,
    doctorPhone: null,
    updatedAt: at('2026-10-01T08:00:00Z'),
  });
  return id;
}

function addMeasurement(patientId: string, overrides: Rec = {}) {
  const row: Rec = {
    id: randomUUID(),
    patientId,
    valueMgDl: 148,
    originalValue: 1.48,
    originalUnit: 'G_L',
    measuredAt: at('2026-10-05T07:30:00Z'),
    context: 'FASTING',
    source: 'MANUAL',
    importBatchId: null,
    noteEncrypted: null,
    updatedAt: at('2026-10-05T07:31:00Z'),
    deletedAt: null,
    ...overrides,
  };
  db.measurements.push(row);
  return row;
}

function addEvent(patientId: string, overrides: Rec = {}) {
  const row: Rec = {
    id: randomUUID(),
    patientId,
    type: 'MEAL',
    occurredAt: at('2026-10-05T12:00:00Z'),
    label: 'Déjeuner',
    detailsEncrypted: encryptField('Riz, poisson', FIELD_KEY),
    durationMinutes: null,
    updatedAt: at('2026-10-05T12:05:00Z'),
    deletedAt: null,
    ...overrides,
  };
  db.events.push(row);
  return row;
}

describe('L1-14 : export des données et suppression du compte', () => {
  let app: INestApplication;
  let baseUrl: string;
  let throttleEnabled = false;
  const jwt = new JwtService({ secret: SECRET });
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const exportFor = (accessToken?: string) =>
    fetch(`${baseUrl}/me/export`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
  const deleteMe = (accessToken: string | undefined, body: unknown) =>
    fetch(`${baseUrl}/me`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 120 }],
          skipIf: () => !throttleEnabled,
        }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [
            { provide: PrismaService, useValue: fakePrisma },
            { provide: ConfigService, useValue: fakeConfig },
          ],
          exports: [PrismaService, ConfigService],
        },
        PatientsModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
    db.users = [];
    db.profiles = new Map();
    db.measurements = [];
    db.events = [];
    db.outbox = [];
    rebind();
    transactions = 0;
    throttleEnabled = false;
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /me/export', () => {
    it('exporte profil, mesures et événements du patient, au format du contrat', async () => {
      const awa = addPatient();
      addMeasurement(awa, { measuredAt: at('2026-10-06T07:30:00Z'), valueMgDl: 162 });
      addMeasurement(awa, { measuredAt: at('2026-10-05T07:30:00Z') }); // plus ancienne : en premier
      addEvent(awa);

      const res = await exportFor(token(awa));
      const body = (await res.json()) as {
        exportedAt: string;
        profile: Rec;
        measurements: Rec[];
        events: Rec[];
      };

      expect(res.status).toBe(200);
      expect(body.exportedAt).toMatch(/Z$/);
      expect(body.profile).toEqual({
        firstName: 'Awa',
        lastName: 'Kabila',
        birthDate: '1990-04-12',
        sex: 'F',
        diabetesType: 'TYPE_2',
        diagnosisYear: 2019,
        preferredUnit: 'G_L',
        thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
        thresholdsReviewedByClinician: false,
        emergencyContact: { name: 'Jean Kabila', phone: '+243 900 000 000', relation: 'Frère' },
      });
      expect(body.measurements.map((m) => m.valueMgDl)).toEqual([148, 162]); // ordre chronologique
      expect(body.measurements[0]).toEqual({
        id: expect.any(String),
        valueMgDl: 148,
        originalValue: 1.48,
        originalUnit: 'G_L',
        measuredAt: '2026-10-05T07:30:00.000Z',
        context: 'FASTING',
        source: 'MANUAL',
        importBatchId: null,
        note: null,
        updatedAt: '2026-10-05T07:31:00.000Z',
        deletedAt: null,
      });
      expect(body.events).toEqual([
        {
          id: expect.any(String),
          type: 'MEAL',
          occurredAt: '2026-10-05T12:00:00.000Z',
          label: 'Déjeuner',
          details: 'Riz, poisson',
          durationMinutes: null,
          updatedAt: '2026-10-05T12:05:00.000Z',
          deletedAt: null,
        },
      ]);
    });

    it('respecte exactement les champs obligatoires du contrat (DataExport, Measurement, LifeEvent)', async () => {
      const awa = addPatient();
      addMeasurement(awa);
      addEvent(awa);
      const body = (await (await exportFor(token(awa))).json()) as Record<string, Rec[] | Rec>;

      const contract = JSON.parse(
        readFileSync(resolve(__dirname, '../../../docs/api/openapi.v0.json'), 'utf-8'),
      ) as { components: { schemas: Record<string, { required: string[]; properties: Rec }> } };
      const schema = (name: string) => contract.components.schemas[name]!;

      expect(Object.keys(body).sort()).toEqual([...schema('DataExport').required].sort());
      const m = (body.measurements as Rec[])[0]!;
      const e = (body.events as Rec[])[0]!;
      expect(Object.keys(m).sort()).toEqual([...schema('Measurement').required].sort());
      expect(Object.keys(e).sort()).toEqual([...schema('LifeEvent').required].sort());
      for (const key of Object.keys(body.profile as Rec)) {
        expect(Object.keys(schema('PatientProfile').properties)).toContain(key);
      }
    });

    it('n’exporte que MES données, jamais celles d’un autre patient', async () => {
      const awa = addPatient();
      const paul = addPatient();
      addMeasurement(awa, { valueMgDl: 111 });
      addMeasurement(paul, { valueMgDl: 222 });
      addEvent(paul, { label: 'Repas de Paul' });

      const body = (await (await exportFor(token(awa))).json()) as {
        measurements: Rec[];
        events: Rec[];
      };

      expect(body.measurements.map((m) => m.valueMgDl)).toEqual([111]);
      expect(body.events).toEqual([]);
    });

    it('n’exporte pas les éléments supprimés (gardés seulement pour la synchronisation)', async () => {
      const awa = addPatient();
      addMeasurement(awa, { valueMgDl: 100 });
      addMeasurement(awa, { valueMgDl: 300, deletedAt: at('2026-10-06T09:00:00Z') });
      addEvent(awa, { deletedAt: at('2026-10-06T09:00:00Z') });

      const body = (await (await exportFor(token(awa))).json()) as {
        measurements: Rec[];
        events: Rec[];
      };

      expect(body.measurements.map((m) => m.valueMgDl)).toEqual([100]);
      expect(body.events).toEqual([]);
    });

    it('rend les notes lisibles (chiffrées en base) ; une note illisible n’empêche pas l’export', async () => {
      const awa = addPatient();
      addMeasurement(awa, { noteEncrypted: encryptField('Avant le petit-déjeuner', FIELD_KEY) });
      addMeasurement(awa, {
        measuredAt: at('2026-10-06T07:30:00Z'),
        noteEncrypted: encryptField('Clé différente', randomBytes(32).toString('base64')),
      });

      const res = await exportFor(token(awa));
      const body = (await res.json()) as { measurements: Rec[] };

      expect(res.status).toBe(200);
      expect(body.measurements.map((m) => m.note)).toEqual(['Avant le petit-déjeuner', null]);
    });

    it('fichier à télécharger, daté, jamais gardé en cache', async () => {
      const awa = addPatient();

      const res = await exportFor(token(awa));

      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-disposition')).toMatch(
        /^attachment; filename="afyabora-export-\d{4}-\d{2}-\d{2}\.json"$/,
      );
    });

    it('profil pas encore créé : 404 ; compte supprimé (jeton encore valide) : 401', async () => {
      const noProfile = randomUUID();
      db.users.push({ id: noProfile, passwordHash });

      expect((await exportFor(token(noProfile))).status).toBe(404);
      expect((await exportFor(token(randomUUID()))).status).toBe(401);
    });

    it('réservé au patient connecté : 401 sans jeton, 403 pour un médecin ou un admin', async () => {
      const awa = addPatient();
      expect((await exportFor()).status).toBe(401);
      expect((await exportFor(token(awa, 'DOCTOR'))).status).toBe(403);
      expect((await exportFor(token(awa, 'ADMIN'))).status).toBe(403);
    });

    it('limite : 429 au 11e export en une minute', async () => {
      const awa = addPatient();
      throttleEnabled = true;
      for (let i = 0; i < 10; i++) expect((await exportFor(token(awa))).status).toBe(200);
      expect((await exportFor(token(awa))).status).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('DELETE /me', () => {
    it('mot de passe incorrect : 403 INVALID_PASSWORD et rien n’est supprimé', async () => {
      const awa = addPatient();
      addMeasurement(awa);

      const res = await deleteMe(token(awa), { password: 'pas-le-bon-mot-de-passe' });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        message: INVALID_PASSWORD_MESSAGE,
        code: 'INVALID_PASSWORD',
      });
      expect(db.users).toHaveLength(1);
      expect(db.measurements).toHaveLength(1);
      expect(transactions).toBe(0);
    });

    it('bon mot de passe : 204, compte et données supprimés en une transaction, les autres intacts', async () => {
      const awa = addPatient();
      const paul = addPatient();
      addMeasurement(awa);
      addEvent(awa);
      addMeasurement(paul);
      db.outbox.push({ id: randomUUID(), userId: awa }, { id: randomUUID(), userId: paul });

      const res = await deleteMe(token(awa), { password: PASSWORD });

      expect(res.status).toBe(204);
      expect(transactions).toBe(1);
      expect(db.users.map((u) => u.id)).toEqual([paul]);
      expect(db.profiles.has(awa)).toBe(false);
      expect(db.measurements.every((m) => m.patientId === paul)).toBe(true);
      expect(db.events).toEqual([]);
      // Notifications en attente (table sans cascade) : celles d'Awa effacées, celles de Paul gardées.
      expect(db.outbox.map((n) => n.userId)).toEqual([paul]);
    });

    it('après la suppression, le jeton encore valide ne donne plus accès à rien (401)', async () => {
      const awa = addPatient();
      const access = token(awa);
      expect((await deleteMe(access, { password: PASSWORD })).status).toBe(204);

      expect((await exportFor(access)).status).toBe(401);
      expect((await deleteMe(access, { password: PASSWORD })).status).toBe(401);
    });

    it('mot de passe absent : 400 ; sans jeton : 401 ; médecin : 403', async () => {
      const awa = addPatient();
      expect((await deleteMe(token(awa), {})).status).toBe(400);
      expect((await deleteMe(undefined, { password: PASSWORD })).status).toBe(401);
      expect((await deleteMe(token(awa, 'DOCTOR'), { password: PASSWORD })).status).toBe(403);
      expect(db.users).toHaveLength(1);
    });

    it('limite : 429 à la 6e tentative en une minute (pas de mot de passe deviné en boucle)', async () => {
      const awa = addPatient();
      throttleEnabled = true;
      for (let i = 0; i < 5; i++) {
        expect((await deleteMe(token(awa), { password: `essai-${i}` })).status).toBe(403);
      }
      expect((await deleteMe(token(awa), { password: PASSWORD })).status).toBe(429);
      expect(db.users).toHaveLength(1);
    });

    it('aucun mot de passe ni donnée de santé dans les journaux', async () => {
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      try {
        const awa = addPatient();
        addMeasurement(awa, { noteEncrypted: encryptField('Note très personnelle', FIELD_KEY) });
        addMeasurement(awa, { noteEncrypted: 'abime:abime:abime' }); // note illisible → avertissement
        await exportFor(token(awa));
        await deleteMe(token(awa), { password: 'mauvais-mot-de-passe' });
        await deleteMe(token(awa), { password: PASSWORD });
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      const logs = written.join('\n');
      for (const secret of [PASSWORD, 'mauvais-mot-de-passe', 'Note très personnelle', 'Kabila']) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});
