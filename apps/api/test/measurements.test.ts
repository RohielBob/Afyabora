// Tests du ticket L2-01 : mesures de glycémie (POST, GET, PUT, DELETE /measurements).
// Vrai serveur HTTP (port 0), vraies gardes JWT et rôles ; base de données SIMULÉE en mémoire qui
// applique réellement les filtres (patient, supprimées, période, curseur) et les contraintes de
// PostgreSQL (identifiant unique → P2002, profil obligatoire → P2003).
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptField, encryptField } from '../src/common/crypto/field-encryption';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { MeasurementsModule } from '../src/modules/measurements/measurements.module';
import { UNUSUAL_VALUE_MESSAGE } from '../src/modules/measurements/measurements.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const FIELD_KEY = randomBytes(32).toString('base64');
const MINUTE = 60_000;

// ---------- Fausse base ----------
interface Row {
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
  editedAt: Date | null;
  updatedAt: Date;
  deletedAt: Date | null;
}

let rows: Row[] = [];
let users = new Set<string>();
let profiles = new Set<string>();
/** Point d'arrêt : s'exécute juste avant l'insertion (reproduit l'ordre de deux envois simultanés). */
let beforeInsert: (() => Promise<void>) | null = null;

type DateFilter = { gte?: Date; lt?: Date };
type Where = {
  id?: string | { lt: string };
  patientId?: string;
  deletedAt?: null;
  measuredAt?: Date | DateFilter;
  OR?: Where[];
};

function matches(row: Row, where: Where): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.id === 'object' && !(row.id < where.id.lt)) return false;
  if (where.patientId !== undefined && row.patientId !== where.patientId) return false;
  if ('deletedAt' in where && row.deletedAt !== null) return false;
  if (where.measuredAt instanceof Date) {
    if (row.measuredAt.getTime() !== where.measuredAt.getTime()) return false;
  } else if (where.measuredAt) {
    const { gte, lt } = where.measuredAt;
    if (gte && row.measuredAt < gte) return false;
    if (lt && !(row.measuredAt < lt)) return false;
  }
  if (where.OR && !where.OR.some((w) => matches(row, w))) return false;
  return true;
}

const copy = (row: Row) => ({ ...row });

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users.has(where.id) ? { id: where.id } : null,
  },
  measurement: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = rows.find((r) => r.id === where.id);
      return row ? copy(row) : null;
    },
    create: async ({
      data,
    }: {
      data: Omit<Row, 'updatedAt' | 'deletedAt' | 'editedAt' | 'importBatchId'>;
    }) => {
      const pause = beforeInsert;
      if (pause) {
        beforeInsert = null;
        await pause();
      }
      if (rows.some((r) => r.id === data.id)) throw { code: 'P2002' }; // identifiant unique
      if (!profiles.has(data.patientId)) throw { code: 'P2003' }; // clé étrangère vers le profil
      const row: Row = {
        importBatchId: null,
        editedAt: null,
        deletedAt: null,
        ...data,
        updatedAt: new Date(),
      };
      rows.push(row);
      return copy(row);
    },
    findMany: async ({ where, take }: { where: Where; orderBy: unknown; take: number }) =>
      rows
        .filter((r) => matches(r, where))
        .sort(
          (a, b) =>
            b.measuredAt.getTime() - a.measuredAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .slice(0, take)
        .map(copy),
    updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const targets = rows.filter((r) => matches(r, where));
      targets.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: targets.length };
    },
  },
};

const fakeConfig = {
  get: () => undefined,
  getOrThrow: (key: string) => {
    if (key === 'FIELD_ENCRYPTION_KEY') return FIELD_KEY;
    throw new Error(`Configuration absente du test : ${key}`);
  },
};
class FakeInfraModule {}

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('L2-01 : mesures de glycémie (/measurements)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const call = (method: string, path: string, who: string | null, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { authorization: `Bearer ${who}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const create = (body: Record<string, unknown>, who = token(awa)) =>
    call('POST', '/measurements', who, body);
  const valid = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    value: 1.48,
    unit: 'G_L',
    measuredAt: '2026-10-07T08:30:00+01:00',
    context: 'FASTING',
    ...overrides,
  });
  const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: SECRET }),
        {
          module: FakeInfraModule,
          global: true,
          providers: [
            { provide: PrismaService, useValue: fakePrisma },
            { provide: ConfigService, useValue: fakeConfig },
          ],
          exports: [PrismaService, ConfigService],
        },
        MeasurementsModule,
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
    rows = [];
    users = new Set([awa, paul]);
    profiles = new Set([awa, paul]);
    beforeInsert = null;
  });

  // ---------------------------------------------------------------------------------------------
  describe('POST /measurements', () => {
    it('1,48 g/L est stocké 148 mg/dL, valeur et unité d’origine gardées, date rendue en UTC', async () => {
      const body = valid();

      const res = await create(body);
      const m = await json(res);

      expect(res.status).toBe(201);
      expect(m).toEqual({
        id: body.id,
        valueMgDl: 148,
        originalValue: 1.48,
        originalUnit: 'G_L',
        measuredAt: '2026-10-07T07:30:00.000Z', // 08:30 à UTC+1
        context: 'FASTING',
        source: 'MANUAL',
        importBatchId: null,
        note: null,
        updatedAt: expect.stringMatching(/Z$/),
        deletedAt: null,
      });
      expect(rows[0]).toMatchObject({ patientId: awa, valueMgDl: 148 });
    });

    it('convertit aussi depuis mmol/L et mg/dL (entier arrondi)', async () => {
      const mmol = await json(await create(valid({ value: 8.2, unit: 'MMOL_L' })));
      const mg = await json(await create(valid({ value: 148.4, unit: 'MG_DL' })));
      expect(mmol.valueMgDl).toBe(148); // 8,2 × 18,016 = 147,7
      expect(mg.valueMgDl).toBe(148);
    });

    it('contexte par défaut : OTHER', async () => {
      const { context: _c, ...withoutContext } = valid();
      expect((await json(await create(withoutContext))).context).toBe('OTHER');
    });

    it('la note est chiffrée en base et rendue en clair au patient', async () => {
      const res = await create(valid({ note: '  Avant le petit-déjeuner ' }));

      expect((await json(res)).note).toBe('Avant le petit-déjeuner');
      const stored = rows[0]!.noteEncrypted!;
      expect(stored).not.toContain('petit-déjeuner');
      expect(decryptField(stored, FIELD_KEY)).toBe('Avant le petit-déjeuner');
    });

    it('rejeu du même envoi (même identifiant) : 200, une seule mesure, l’originale est gardée', async () => {
      const body = valid();
      expect((await create(body)).status).toBe(201);

      const replay = await create({ ...body, value: 2.5 }); // même id, valeur différente

      expect(replay.status).toBe(200);
      expect((await json(replay)).valueMgDl).toBe(148);
      expect(rows).toHaveLength(1);
    });

    it('deux envois SIMULTANÉS de la même mesure : une seule création, l’autre reçoit la mesure (200)', async () => {
      const body = valid();
      let other: Response | null = null;
      // Ordre exact : A a vérifié que l'identifiant est libre et va insérer ; B fait tout son envoi avant.
      beforeInsert = async () => {
        other = await create(body);
      };

      const first = await create(body);

      expect(other!.status).toBe(201);
      expect(first.status).toBe(200);
      expect(rows).toHaveLength(1);
      expect((await json(first)).id).toBe(body.id);
    });

    it('identifiant déjà utilisé par un AUTRE patient : refus neutre, rien de sa mesure n’est révélé', async () => {
      const body = valid({ note: 'Note de Paul' });
      expect((await create(body, token(paul))).status).toBe(201);

      const res = await create({ ...body, note: undefined });
      const text = await res.text();

      expect(res.status).toBe(400);
      expect(text).not.toContain('Note de Paul');
      expect(text).not.toContain('148');
      expect(rows).toHaveLength(1);
    });

    it('18,7 g/L refusé sans confirmation (422 UNUSUAL_VALUE), accepté une fois confirmé', async () => {
      const body = valid({ value: 18.7 });

      const refused = await create(body);
      expect(refused.status).toBe(422);
      expect(await json(refused)).toEqual({
        message: UNUSUAL_VALUE_MESSAGE,
        code: 'UNUSUAL_VALUE',
        valueMgDl: 1870,
        plausibleMinMgDl: 20,
        plausibleMaxMgDl: 600,
      });
      expect(rows).toHaveLength(0);

      const confirmed = await create({ ...body, confirmedUnusual: true });
      expect(confirmed.status).toBe(201);
      expect((await json(confirmed)).valueMgDl).toBe(1870);
    });

    it('trop bas aussi (15 mg/dL) ; les bornes 20 et 600 sont acceptées', async () => {
      expect((await create(valid({ value: 15, unit: 'MG_DL' }))).status).toBe(422);
      expect((await create(valid({ value: 20, unit: 'MG_DL' }))).status).toBe(201);
      expect((await create(valid({ value: 600, unit: 'MG_DL' }))).status).toBe(201);
    });

    it('date plus de 5 minutes dans le futur : 400 sur « measuredAt » ; 4 minutes : accepté', async () => {
      const future = await create(valid({ measuredAt: isoIn(6 * MINUTE) }));
      expect(future.status).toBe(400);
      expect(await json(future)).toEqual({
        message: 'Données invalides',
        issues: [{ path: 'measuredAt', message: 'La date de la mesure est dans le futur.' }],
      });

      expect((await create(valid({ measuredAt: isoIn(4 * MINUTE) }))).status).toBe(201);
    });

    it('données mal formées : 400 avec le champ en cause', async () => {
      const cases = [
        valid({ id: 'pas-un-uuid' }),
        valid({ value: -1 }),
        valid({ value: 0 }),
        valid({ unit: 'KG' }),
        valid({ measuredAt: '07/10/2026' }),
        valid({ measuredAt: '2026-10-07T08:30:00' }), // sans fuseau : ambigu
        valid({ note: 'x'.repeat(501) }),
        { id: randomUUID(), value: 1.2 },
      ];
      for (const body of cases) {
        const res = await create(body);
        expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect((await json<{ issues: unknown[] }>(res)).issues.length).toBeGreaterThan(0);
      }
      expect(rows).toHaveLength(0);
    });

    it('sans profil médical : 400 explicite ; compte supprimé (jeton encore valable) : 401', async () => {
      profiles.delete(awa);
      const noProfile = await create(valid());
      expect(noProfile.status).toBe(400);
      expect((await json(noProfile)).message).toMatch(/profil/);

      const ghost = randomUUID();
      expect((await create(valid(), token(ghost))).status).toBe(401);
    });

    it('réservé au patient : 401 sans jeton, 403 pour un médecin ou un admin', async () => {
      expect((await create(valid(), '')).status).toBe(401);
      expect((await create(valid(), token(awa, 'DOCTOR'))).status).toBe(403);
      expect((await create(valid(), token(awa, 'ADMIN'))).status).toBe(403);
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /measurements', () => {
    const at = (iso: string) => valid({ measuredAt: iso });

    it('mes mesures seulement, sans les supprimées, de la plus récente à la plus ancienne', async () => {
      await create(at('2026-10-05T07:00:00Z'));
      await create(at('2026-10-07T07:00:00Z'));
      const toDelete = at('2026-10-06T07:00:00Z');
      await create(toDelete);
      await call('DELETE', `/measurements/${toDelete.id}`, token(awa));
      await create(at('2026-10-08T07:00:00Z'), token(paul));

      const res = await call('GET', '/measurements', token(awa));
      const body = await json<{ items: { measuredAt: string }[]; nextCursor: string | null }>(res);

      expect(res.status).toBe(200);
      expect(body.items.map((m) => m.measuredAt)).toEqual([
        '2026-10-07T07:00:00.000Z',
        '2026-10-05T07:00:00.000Z',
      ]);
      expect(body.nextCursor).toBeNull();
    });

    it('période : « from » inclus, « to » exclu', async () => {
      for (const day of ['04', '05', '06', '07']) await create(at(`2026-10-${day}T00:00:00Z`));

      const res = await call(
        'GET',
        '/measurements?from=2026-10-05T00:00:00Z&to=2026-10-07T00:00:00Z',
        token(awa),
      );
      const days = (await json<{ items: { measuredAt: string }[] }>(res)).items.map((m) =>
        m.measuredAt.slice(8, 10),
      );

      expect(days).toEqual(['06', '05']);
    });

    it('pagination par curseur : toutes les mesures une seule fois, même à la même heure', async () => {
      // 5 mesures dont 3 à la même heure (départage par identifiant).
      for (const iso of [
        '2026-10-01T08:00:00Z',
        '2026-10-02T08:00:00Z',
        '2026-10-02T08:00:00Z',
        '2026-10-02T08:00:00Z',
        '2026-10-03T08:00:00Z',
      ]) {
        await create(at(iso));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
        const page = await json<{ items: { id: string }[]; nextCursor: string | null }>(
          await call('GET', `/measurements${query}`, token(awa)),
        );
        seen.push(...page.items.map((m) => m.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('paramètres invalides : 400 (curseur abîmé, limite trop grande, période à l’envers)', async () => {
      for (const query of [
        '?cursor=nimporte-quoi',
        '?limit=5000',
        '?limit=0',
        '?from=2026-10-07T00:00:00Z&to=2026-10-01T00:00:00Z',
        '?from=hier',
      ]) {
        expect((await call('GET', `/measurements${query}`, token(awa))).status, query).toBe(400);
      }
    });

    it('réservé au patient : 401 / 403', async () => {
      expect((await call('GET', '/measurements', null)).status).toBe(401);
      expect((await call('GET', '/measurements', token(awa, 'DOCTOR'))).status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('PUT /measurements/:id', () => {
    it('nouvelle valeur : reconvertie en mg/dL, valeur d’origine mise à jour, « editedAt » renseigné', async () => {
      const body = valid();
      await create(body);

      const res = await call('PUT', `/measurements/${body.id}`, token(awa), {
        value: 8.5,
        unit: 'MMOL_L',
      });
      const m = await json(res);

      expect(res.status).toBe(200);
      expect(m).toMatchObject({ valueMgDl: 153, originalValue: 8.5, originalUnit: 'MMOL_L' });
      expect(m.context).toBe('FASTING'); // inchangé
      expect(rows[0]!.editedAt).toBeInstanceOf(Date);
    });

    it('seulement le contexte ou la date : la valeur ne bouge pas', async () => {
      const body = valid();
      await create(body);

      const m = await json(
        await call('PUT', `/measurements/${body.id}`, token(awa), {
          context: 'AFTER_MEAL',
          measuredAt: '2026-10-07T10:00:00Z',
        }),
      );

      expect(m).toMatchObject({
        valueMgDl: 148,
        context: 'AFTER_MEAL',
        measuredAt: '2026-10-07T10:00:00.000Z',
      });
    });

    it('note : remplacée, ou effacée avec un texte vide', async () => {
      const body = valid({ note: 'Avant' });
      await create(body);
      const path = `/measurements/${body.id}`;

      expect((await json(await call('PUT', path, token(awa), { note: 'Après' }))).note).toBe(
        'Après',
      );
      expect((await json(await call('PUT', path, token(awa), { note: '' }))).note).toBeNull();
      expect(rows[0]!.noteEncrypted).toBeNull();
    });

    it('valeur sans unité : 400 ; valeur inhabituelle : 422 sauf confirmation ; date future : 400', async () => {
      const body = valid();
      await create(body);
      const path = `/measurements/${body.id}`;

      expect((await call('PUT', path, token(awa), { value: 1.6 })).status).toBe(400);
      expect((await call('PUT', path, token(awa), { value: 18.7, unit: 'G_L' })).status).toBe(422);
      expect(
        (await call('PUT', path, token(awa), { value: 18.7, unit: 'G_L', confirmedUnusual: true }))
          .status,
      ).toBe(200);
      expect((await call('PUT', path, token(awa), { measuredAt: isoIn(10 * MINUTE) })).status).toBe(
        400,
      );
    });

    it('mesure d’un autre patient, supprimée ou inconnue : 404 (rien n’est révélé ni modifié)', async () => {
      const paulsBody = valid();
      await create(paulsBody, token(paul));
      const mine = valid();
      await create(mine);
      await call('DELETE', `/measurements/${mine.id}`, token(awa));

      for (const id of [paulsBody.id, mine.id, randomUUID()]) {
        const res = await call('PUT', `/measurements/${id}`, token(awa), { context: 'OTHER' });
        expect(res.status).toBe(404);
      }
      expect(rows.find((r) => r.id === paulsBody.id)!.context).toBe('FASTING');
    });

    it('identifiant mal formé : 400', async () => {
      expect(
        (await call('PUT', '/measurements/123', token(awa), { context: 'OTHER' })).status,
      ).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('DELETE /measurements/:id', () => {
    it('suppression = tombstone (pour la synchronisation), note effacée, 204 même si déjà supprimée', async () => {
      const body = valid({ note: 'Privé' });
      await create(body);
      const path = `/measurements/${body.id}`;

      expect((await call('DELETE', path, token(awa))).status).toBe(204);
      expect(rows[0]!.deletedAt).toBeInstanceOf(Date); // la ligne reste : la suppression se propage
      expect(rows[0]!.noteEncrypted).toBeNull();
      expect((await call('DELETE', path, token(awa))).status).toBe(204); // idempotent
    });

    it('un rejeu de la création après suppression ne fait pas revivre la mesure', async () => {
      const body = valid();
      await create(body);
      await call('DELETE', `/measurements/${body.id}`, token(awa));

      const replay = await create(body);

      expect(replay.status).toBe(200);
      expect((await json(replay)).deletedAt).toMatch(/Z$/);
      expect(rows).toHaveLength(1);
    });

    it('mesure d’un autre patient ou inconnue : 404, rien n’est supprimé', async () => {
      const paulsBody = valid();
      await create(paulsBody, token(paul));

      expect((await call('DELETE', `/measurements/${paulsBody.id}`, token(awa))).status).toBe(404);
      expect((await call('DELETE', `/measurements/${randomUUID()}`, token(awa))).status).toBe(404);
      expect(rows[0]!.deletedAt).toBeNull();
    });

    it('réservé au patient : 401 / 403', async () => {
      const body = valid();
      await create(body);
      expect((await call('DELETE', `/measurements/${body.id}`, null)).status).toBe(401);
      expect((await call('DELETE', `/measurements/${body.id}`, token(awa, 'DOCTOR'))).status).toBe(
        403,
      );
      expect(rows[0]!.deletedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  it('aucune donnée de santé dans les journaux (valeur, note), même avec une note illisible', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      const body = valid({ note: 'Note très personnelle', value: 2.37 });
      await create(body);
      rows[0]!.noteEncrypted = encryptField('autre clé', randomBytes(32).toString('base64'));
      const list = await json<{ items: { note: string | null }[] }>(
        await call('GET', '/measurements', token(awa)),
      );
      expect(list.items[0]!.note).toBeNull(); // note illisible : null, sans erreur
      await create(valid({ value: 18.7 })); // 422
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const logs = written.join('\n');
    for (const secret of ['Note très personnelle', '237', '1870', awa]) {
      expect(logs).not.toContain(secret);
    }
  });
});
