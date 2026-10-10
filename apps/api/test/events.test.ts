// Tests du ticket L2-02 : événements de vie (POST, GET, PUT, DELETE /events).
// Vrai serveur HTTP (port 0), vraies gardes JWT et rôles ; base SIMULÉE qui applique réellement les filtres
// (patient, supprimés, période, curseur) et les contraintes PostgreSQL (P2002 identifiant, P2003 profil).
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lifeEventDtoSchema } from '@glyka/shared';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { EventsModule } from '../src/modules/events/events.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const MINUTE = 60_000;

// ---------- Fausse base ----------
interface Row {
  id: string;
  patientId: string;
  type: string;
  occurredAt: Date;
  label: string;
  details: string | null;
  durationMinutes: number | null;
  clientUpdatedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

let rows: Row[] = [];
let users = new Set<string>();
let profiles = new Set<string>();
let beforeInsert: (() => Promise<void>) | null = null;

type Where = {
  id?: string | { lt: string };
  patientId?: string;
  deletedAt?: null;
  occurredAt?: Date | { gte?: Date; lt?: Date };
  OR?: Where[];
};

function matches(row: Row, where: Where): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.id === 'object' && !(row.id < where.id.lt)) return false;
  if (where.patientId !== undefined && row.patientId !== where.patientId) return false;
  if ('deletedAt' in where && row.deletedAt !== null) return false;
  if (where.occurredAt instanceof Date) {
    if (row.occurredAt.getTime() !== where.occurredAt.getTime()) return false;
  } else if (where.occurredAt) {
    const { gte, lt } = where.occurredAt;
    if (gte && row.occurredAt < gte) return false;
    if (lt && !(row.occurredAt < lt)) return false;
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
  lifeEvent: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = rows.find((r) => r.id === where.id);
      return row ? copy(row) : null;
    },
    create: async ({ data }: { data: Omit<Row, 'updatedAt' | 'deletedAt'> }) => {
      const pause = beforeInsert;
      if (pause) {
        beforeInsert = null;
        await pause();
      }
      if (rows.some((r) => r.id === data.id)) throw { code: 'P2002' };
      if (!profiles.has(data.patientId)) throw { code: 'P2003' };
      const row: Row = { deletedAt: null, ...data, updatedAt: new Date() };
      rows.push(row);
      return copy(row);
    },
    findMany: async ({ where, take }: { where: Where; take: number }) =>
      rows
        .filter((r) => matches(r, where))
        .sort(
          (a, b) =>
            b.occurredAt.getTime() - a.occurredAt.getTime() ||
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
class FakeInfraModule {}

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('L2-02 : événements de vie (/events)', () => {
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
    call('POST', '/events', who, body);
  const meal = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    type: 'MEAL',
    occurredAt: '2026-10-07T12:30:00+01:00',
    label: 'Déjeuner',
    details: 'Riz, poisson, légumes',
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
          providers: [{ provide: PrismaService, useValue: fakePrisma }],
          exports: [PrismaService],
        },
        EventsModule,
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
  describe('POST /events', () => {
    it('crée un repas au format du contrat, date rendue en UTC', async () => {
      const body = meal();

      const res = await create(body);
      const event = await json(res);

      expect(res.status).toBe(201);
      expect(lifeEventDtoSchema.safeParse(event).success).toBe(true);
      expect(event).toEqual({
        id: body.id,
        type: 'MEAL',
        occurredAt: '2026-10-07T11:30:00.000Z',
        label: 'Déjeuner',
        details: 'Riz, poisson, légumes',
        durationMinutes: null,
        updatedAt: expect.stringMatching(/Z$/),
        deletedAt: null,
      });
    });

    it('activité avec durée ; traitement déclaré enregistré tel quel (aucun calcul de dose)', async () => {
      const walk = await json(
        await create(
          meal({ type: 'ACTIVITY', label: 'Marche', details: undefined, durationMinutes: 45 }),
        ),
      );
      const treatment = await json(
        await create(meal({ type: 'TREATMENT', label: 'Metformine', details: '500 mg, matin' })),
      );

      expect(walk).toMatchObject({ type: 'ACTIVITY', durationMinutes: 45, details: null });
      expect(treatment).toMatchObject({
        type: 'TREATMENT',
        label: 'Metformine',
        details: '500 mg, matin',
      });
      expect(Object.keys(treatment).sort()).toEqual(
        [
          'deletedAt',
          'details',
          'durationMinutes',
          'id',
          'label',
          'occurredAt',
          'type',
          'updatedAt',
        ].sort(),
      ); // rien d'ajouté par le serveur (pas de « dose conseillée »)
    });

    it('libellé et texte libre : espaces retirés ; texte vide = pas de texte', async () => {
      const event = await json(await create(meal({ label: '  Dîner  ', details: '   ' })));
      expect(event).toMatchObject({ label: 'Dîner', details: null });
    });

    it('rejeu du même événement : 200, un seul enregistrement, l’original est gardé', async () => {
      const body = meal();
      expect((await create(body)).status).toBe(201);

      const replay = await create({ ...body, label: 'Autre chose' });

      expect(replay.status).toBe(200);
      expect((await json(replay)).label).toBe('Déjeuner');
      expect(rows).toHaveLength(1);
    });

    it('deux envois SIMULTANÉS du même événement : un seul enregistrement', async () => {
      const body = meal();
      let other: Response | null = null;
      beforeInsert = async () => {
        other = await create(body);
      };

      const first = await create(body);

      expect(other!.status).toBe(201);
      expect(first.status).toBe(200);
      expect(rows).toHaveLength(1);
    });

    it('identifiant d’un autre patient : refus neutre, rien n’est révélé', async () => {
      const body = meal({ details: 'Détail de Paul' });
      await create(body, token(paul));

      const res = await create({ ...body, details: undefined });

      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain('Détail de Paul');
      expect(rows).toHaveLength(1);
    });

    it('date plus de 5 minutes dans le futur : 400 sur « occurredAt » ; 4 minutes : accepté', async () => {
      const future = await create(meal({ occurredAt: isoIn(6 * MINUTE) }));
      expect(future.status).toBe(400);
      expect((await json<{ issues: { path: string }[] }>(future)).issues[0]!.path).toBe(
        'occurredAt',
      );
      expect((await create(meal({ occurredAt: isoIn(4 * MINUTE) }))).status).toBe(201);
    });

    it('données mal formées : 400', async () => {
      for (const body of [
        meal({ id: 'pas-un-uuid' }),
        meal({ type: 'SOMMEIL' }),
        meal({ label: '' }),
        meal({ label: 'x'.repeat(121) }),
        meal({ details: 'x'.repeat(501) }),
        meal({ durationMinutes: 0 }),
        meal({ durationMinutes: 1441 }),
        meal({ durationMinutes: 12.5 }),
        meal({ occurredAt: '2026-10-07T12:30:00' }),
      ]) {
        expect((await create(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
      }
      expect(rows).toHaveLength(0);
    });

    it('sans profil : 400 explicite ; compte supprimé : 401 ; médecin : 403 ; sans jeton : 401', async () => {
      profiles.delete(awa);
      expect((await create(meal())).status).toBe(400);
      expect((await create(meal(), token(randomUUID()))).status).toBe(401);
      expect((await create(meal(), token(paul, 'DOCTOR'))).status).toBe(403);
      expect((await create(meal(), '')).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /events', () => {
    it('mes événements seulement, sans les supprimés, du plus récent au plus ancien', async () => {
      await create(meal({ occurredAt: '2026-10-05T12:00:00Z' }));
      await create(meal({ occurredAt: '2026-10-07T12:00:00Z' }));
      const gone = meal({ occurredAt: '2026-10-06T12:00:00Z' });
      await create(gone);
      await call('DELETE', `/events/${gone.id}`, token(awa));
      await create(meal({ occurredAt: '2026-10-08T12:00:00Z' }), token(paul));

      const body = await json<{ items: { occurredAt: string }[]; nextCursor: string | null }>(
        await call('GET', '/events', token(awa)),
      );

      expect(body.items.map((e) => e.occurredAt.slice(0, 10))).toEqual([
        '2026-10-07',
        '2026-10-05',
      ]);
      expect(body.nextCursor).toBeNull();
    });

    it('période [from ; to[ et pagination complète par curseur (même heure départagée)', async () => {
      for (const iso of [
        '2026-10-04T12:00:00Z',
        '2026-10-05T12:00:00Z',
        '2026-10-05T12:00:00Z',
        '2026-10-06T12:00:00Z',
        '2026-10-07T12:00:00Z',
      ]) {
        await create(meal({ occurredAt: iso }));
      }
      const range = await json<{ items: unknown[] }>(
        await call('GET', '/events?from=2026-10-05T00:00:00Z&to=2026-10-07T00:00:00Z', token(awa)),
      );
      expect(range.items).toHaveLength(3);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      type Page = { items: { id: string }[]; nextCursor: string | null };
      do {
        const path: string = `/events?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const page: Page = await json<Page>(await call('GET', path, token(awa)));
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(new Set(seen).size).toBe(5);
      expect(pages).toBe(3);
    });

    it('paramètres invalides : 400 ; rôle : 401 / 403', async () => {
      expect((await call('GET', '/events?cursor=abime', token(awa))).status).toBe(400);
      expect((await call('GET', '/events?limit=0', token(awa))).status).toBe(400);
      expect((await call('GET', '/events', null)).status).toBe(401);
      expect((await call('GET', '/events', token(awa, 'DOCTOR'))).status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('PUT /events/:id', () => {
    it('modifie seulement les champs envoyés ; texte vide = effacé', async () => {
      const body = meal();
      await create(body);
      const path = `/events/${body.id}`;

      const renamed = await json(await call('PUT', path, token(awa), { label: 'Dîner' }));
      expect(renamed).toMatchObject({
        label: 'Dîner',
        type: 'MEAL',
        details: 'Riz, poisson, légumes',
      });

      const cleared = await json(await call('PUT', path, token(awa), { details: '' }));
      expect(cleared.details).toBeNull();

      const changed = await json(
        await call('PUT', path, token(awa), { type: 'ACTIVITY', durationMinutes: 30 }),
      );
      expect(changed).toMatchObject({ type: 'ACTIVITY', durationMinutes: 30, label: 'Dîner' });
    });

    it('date future : 400 ; événement d’un autre, supprimé ou inconnu : 404 ; identifiant mal formé : 400', async () => {
      const mine = meal();
      await create(mine);
      const paulsEvent = meal();
      await create(paulsEvent, token(paul));
      const deleted = meal();
      await create(deleted);
      await call('DELETE', `/events/${deleted.id}`, token(awa));

      expect(
        (await call('PUT', `/events/${mine.id}`, token(awa), { occurredAt: isoIn(10 * MINUTE) }))
          .status,
      ).toBe(400);
      for (const id of [paulsEvent.id, deleted.id, randomUUID()]) {
        expect((await call('PUT', `/events/${id}`, token(awa), { label: 'X' })).status).toBe(404);
      }
      expect(rows.find((r) => r.id === paulsEvent.id)!.label).toBe('Déjeuner');
      expect((await call('PUT', '/events/123', token(awa), { label: 'X' })).status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('DELETE /events/:id', () => {
    it('tombstone, texte libre effacé, idempotent ; un rejeu ne fait pas revivre l’événement', async () => {
      const body = meal({ details: 'Privé' });
      await create(body);
      const path = `/events/${body.id}`;

      expect((await call('DELETE', path, token(awa))).status).toBe(204);
      expect(rows[0]!.deletedAt).toBeInstanceOf(Date);
      expect(rows[0]!.details).toBeNull();
      expect((await call('DELETE', path, token(awa))).status).toBe(204);

      const replay = await create(body);
      expect(replay.status).toBe(200);
      expect((await json(replay)).deletedAt).toMatch(/Z$/);
    });

    it('événement d’un autre patient ou inconnu : 404, rien n’est supprimé ; rôle : 401 / 403', async () => {
      const paulsEvent = meal();
      await create(paulsEvent, token(paul));

      expect((await call('DELETE', `/events/${paulsEvent.id}`, token(awa))).status).toBe(404);
      expect((await call('DELETE', `/events/${randomUUID()}`, token(awa))).status).toBe(404);
      expect((await call('DELETE', `/events/${paulsEvent.id}`, null)).status).toBe(401);
      expect((await call('DELETE', `/events/${paulsEvent.id}`, token(paul, 'DOCTOR'))).status).toBe(
        403,
      );
      expect(rows[0]!.deletedAt).toBeNull();
    });
  });

  it('aucun texte libre ni libellé dans les journaux', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      const body = meal({ label: 'Insuline rapide', details: 'Détail très personnel' });
      await create(body);
      await create(meal({ occurredAt: isoIn(60 * MINUTE), details: 'Futur personnel' }));
      await call('PUT', `/events/${body.id}`, token(awa), { details: 'Encore personnel' });
      await call('DELETE', `/events/${body.id}`, token(awa));
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const logs = written.join('\n');
    for (const secret of [
      'Insuline rapide',
      'Détail très personnel',
      'Futur personnel',
      'Encore personnel',
    ]) {
      expect(logs).not.toContain(secret);
    }
  });
});
