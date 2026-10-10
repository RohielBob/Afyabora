// Tests du ticket L1-05 : GET et PUT /me/profile (profil médical du patient et seuils d'alerte).
// Vrai serveur HTTP (port 0), vraies gardes JWT et rôles ; base de données SIMULÉE en mémoire.
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PatientsModule } from '../src/modules/patients/patients.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';

// ---------- Fausse base : table PatientProfile, indexée par userId ----------
type Row = Record<string, unknown> & { userId: string; updatedAt: Date };
let profiles = new Map<string, Row>();
let existingUsers = new Set<string>();

const pick = (row: Row, select: Record<string, boolean>) =>
  Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));

const fakePrisma = {
  patientProfile: {
    findUnique: async ({
      where,
      select,
    }: {
      where: { userId: string };
      select: Record<string, boolean>;
    }) => {
      const row = profiles.get(where.userId);
      return row ? pick(row, select) : null;
    },
    upsert: async ({
      where,
      create,
      update,
      select,
    }: {
      where: { userId: string };
      create: Row;
      update: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => {
      // Comme PostgreSQL : clé étrangère vers User (erreur Prisma P2003 si le compte n'existe plus).
      if (!existingUsers.has(where.userId)) throw { code: 'P2003' };
      const current = profiles.get(where.userId);
      const row: Row = current
        ? { ...current, ...update, updatedAt: new Date() }
        : { ...create, updatedAt: new Date() };
      profiles.set(where.userId, row);
      return pick(row, select);
    },
  },
};

class FakeInfraModule {}

const profile = {
  firstName: 'Jean',
  lastName: 'Demo',
  birthDate: '1980-05-14',
  sex: 'M',
  diabetesType: 'TYPE_2',
  diagnosisYear: 2016,
  preferredUnit: 'MMOL_L',
  thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
  thresholdsReviewedByClinician: true,
  emergencyContact: { name: 'Marie Demo', phone: '+243810000000', relation: 'Épouse' },
};

describe('L1-05 : profil patient et seuils d’alerte (/me/profile)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const jean = randomUUID();
  const awa = randomUUID();

  const tokenFor = (sub: string, role = 'PATIENT') =>
    jwt.sign({ sub, role }, { expiresIn: 900, algorithm: 'HS256' });
  const request = (method: 'GET' | 'PUT', token?: string, body?: unknown) =>
    fetch(`${baseUrl}/me/profile`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

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
        PatientsModule,
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
    profiles = new Map();
    existingUsers = new Set([jean, awa]);
  });

  it('GET avant toute création : 404 (le mobile lance l’assistant de profil)', async () => {
    const res = await request('GET', tokenFor(jean));
    expect(res.status).toBe(404);
  });

  it('PUT crée le profil (200) puis GET le renvoie à l’identique, avec updatedAt en UTC', async () => {
    const put = await request('PUT', tokenFor(jean), profile);
    const saved = (await put.json()) as Record<string, unknown>;

    expect(put.status).toBe(200);
    const { updatedAt, ...rest } = saved;
    expect(rest).toEqual(profile);
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const get = await request('GET', tokenFor(jean));
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(saved);
  });

  it('stocke les seuils en mg/dL et l’unité préférée à part (changer d’unité ne touche pas aux seuils)', async () => {
    await request('PUT', tokenFor(jean), profile);
    await request('PUT', tokenFor(jean), { ...profile, preferredUnit: 'G_L' });

    const row = profiles.get(jean)!;
    expect(row.preferredUnit).toBe('G_L');
    expect([row.veryLowMgDl, row.targetMinMgDl, row.targetMaxMgDl, row.veryHighMgDl]).toEqual([
      54, 70, 180, 250,
    ]);
  });

  it('PUT remplace tout le profil : un champ facultatif absent est effacé', async () => {
    await request('PUT', tokenFor(jean), profile);
    const { emergencyContact: _contact, diagnosisYear: _year, ...withoutOptional } = profile;

    const res = await request('PUT', tokenFor(jean), withoutOptional);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty('emergencyContact');
    expect(body).not.toHaveProperty('diagnosisYear');
    expect(profiles.get(jean)!.emergencyContactPhone).toBeNull();
  });

  it('applique les valeurs par défaut : unité g/L, seuils non relus par un professionnel', async () => {
    const { preferredUnit: _u, thresholdsReviewedByClinician: _r, ...minimal } = profile;
    const body = (await (await request('PUT', tokenFor(jean), minimal)).json()) as Record<
      string,
      unknown
    >;
    expect(body.preferredUnit).toBe('G_L');
    expect(body.thresholdsReviewedByClinician).toBe(false);
  });

  it('refuse des seuils incohérents (400) en désignant le champ, sans rien enregistrer', async () => {
    const res = await request('PUT', tokenFor(jean), {
      ...profile,
      thresholds: { veryLowMgDl: 90, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
    });
    const body = (await res.json()) as { issues: { path: string; message: string }[] };

    expect(res.status).toBe(400);
    expect(body.issues.map((i) => i.path)).toEqual(['thresholds.veryLowMgDl']);
    expect(profiles.size).toBe(0);
  });

  it('refuse une date de naissance future et des champs obligatoires manquants', async () => {
    const future = await request('PUT', tokenFor(jean), {
      ...profile,
      birthDate: '2999-01-01',
      diagnosisYear: undefined,
    });
    const { thresholds: _t, ...noThresholds } = profile;
    const missing = await request('PUT', tokenFor(jean), noThresholds);

    expect(future.status).toBe(400);
    expect(missing.status).toBe(400);
  });

  it('un patient ne peut pas lire ni modifier le profil d’un autre', async () => {
    await request('PUT', tokenFor(jean), profile);
    await request('PUT', tokenFor(awa), { ...profile, firstName: 'Awa', sex: 'F' });

    const asJean = (await (await request('GET', tokenFor(jean))).json()) as { firstName: string };
    const asAwa = (await (await request('GET', tokenFor(awa))).json()) as { firstName: string };

    // Chacun ne voit que SON profil : l'identifiant vient du jeton, il n'y a pas d'identifiant dans l'URL.
    expect(asJean.firstName).toBe('Jean');
    expect(asAwa.firstName).toBe('Awa');
    expect(profiles.get(jean)!.firstName).toBe('Jean');
  });

  it('réservé aux patients : 403 pour un médecin ou un admin, 401 sans jeton', async () => {
    expect((await request('GET', tokenFor(randomUUID(), 'DOCTOR'))).status).toBe(403);
    expect((await request('PUT', tokenFor(randomUUID(), 'ADMIN'), profile)).status).toBe(403);
    expect((await request('GET')).status).toBe(401);
  });

  it('compte supprimé mais jeton encore valide : 401 au lieu d’une erreur 500', async () => {
    const ghost = randomUUID(); // absent de existingUsers
    const res = await request('PUT', tokenFor(ghost), profile);
    expect(res.status).toBe(401);
  });
});
