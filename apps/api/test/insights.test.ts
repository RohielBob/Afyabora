// Tests du ticket L3-03 : GET /insights et GET /quality, branchés sur @glyka/analytics.
// Vrai serveur HTTP (port 0), vraies gardes JWT et rôles ; base de données SIMULÉE en mémoire qui
// applique réellement les filtres (patient, supprimées, période). L'horloge est figée : la période
// « les N derniers jours » est donc connue à la milliseconde.
//
// Test obligatoire du module (README) : « les pourcentages de l'API = ceux de analytics sur un jeu
// connu ». Le jeu connu est la semaine de référence de L3-01 (packages/analytics/test/reference),
// dont tous les résultats ont été calculés à la main et recalculés indépendamment (oracle.py).
import { Logger, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCLAIMER_FR } from '@glyka/analytics';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { InsightsModule } from '../src/modules/insights/insights.module';
import { LLM_PROVIDER } from '../src/modules/insights/llm/llm-provider';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  DAY,
  EXPECTED,
  TZ_OFFSET_MINUTES,
  referenceDataset,
} from '../../../packages/analytics/test/reference/reference-data';

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
const MINUTE = 60_000;

/**
 * « Maintenant » : dimanche 4 octobre 2026, 23:30 à Kinshasa. La dernière mesure de la semaine de
 * référence date de 30 minutes ; les 7 derniers jours vont du 28 septembre au 4 octobre inclus.
 */
const NOW = Date.UTC(2026, 9, 4, 22, 30);

// ---------- Fausse base ----------
interface Row {
  id: string;
  patientId: string;
  valueMgDl: number;
  measuredAt: Date;
  deletedAt: Date | null;
}
interface Profile {
  veryLowMgDl: number;
  targetMinMgDl: number;
  targetMaxMgDl: number;
  veryHighMgDl: number;
  timezoneOffsetMinutes: number;
}
type MeasurementQuery = {
  where: { patientId: string; deletedAt: null; measuredAt: { gte: Date; lt: Date } };
  select: Record<string, boolean>;
};

let rows: Row[] = [];
let profiles = new Map<string, Profile>();
/** Dernière requête de mesures reçue par la base (pour vérifier la fenêtre lue). */
let lastQuery: MeasurementQuery | null = null;

const DEFAULT_PROFILE: Profile = {
  veryLowMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  veryHighMgDl: 250,
  timezoneOffsetMinutes: 60,
};

const fakePrisma = {
  patientProfile: {
    findUnique: async ({ where }: { where: { userId: string } }) => {
      const p = profiles.get(where.userId);
      return p ? { ...p } : null;
    },
  },
  measurement: {
    findMany: async (query: MeasurementQuery) => {
      lastQuery = query;
      const { patientId, measuredAt } = query.where;
      return rows
        .filter(
          (r) =>
            r.patientId === patientId &&
            r.deletedAt === null &&
            r.measuredAt >= measuredAt.gte &&
            r.measuredAt < measuredAt.lt,
        )
        .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
        .map((r) => ({ id: r.id, measuredAt: r.measuredAt, valueMgDl: r.valueMgDl }));
    },
  },
};
class FakeInfraModule {}

// ---------- Jeu de référence (identifiants lisibles → UUID, comme en base) ----------
const uuidOf = new Map<string, string>();
const refOf = new Map<string, string>();
function uuidFor(refId: string): string {
  let id = uuidOf.get(refId);
  if (!id) {
    id = randomUUID();
    uuidOf.set(refId, id);
    refOf.set(id, refId);
  }
  return id;
}

/** Enregistre la semaine de référence pour `patientId`, vécue dans un fuseau de `offset` minutes. */
function seedReference(patientId: string, offset = TZ_OFFSET_MINUTES) {
  const shift = (TZ_OFFSET_MINUTES - offset) * MINUTE; // mêmes heures sur l'horloge du patient
  for (const p of referenceDataset()) {
    rows.push({
      id: uuidFor(`${patientId}:${p.id}`),
      patientId,
      valueMgDl: p.mgDl,
      measuredAt: new Date(p.at + shift),
      deletedAt: null,
    });
  }
}

/** Observations attendues, avec les UUID du patient à la place des identifiants lisibles. */
const expectedInsights = (patientId: string) =>
  EXPECTED.insights.map((insight, i) => ({
    ...insight,
    evidenceIds: insight.evidenceIds.map((ref) => uuidOf.get(`${patientId}:${ref}`)),
    text: EXPECTED.sentences[i],
  }));

describe('L3-03 : analyse (/insights) et qualité des données (/quality)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const awa = randomUUID();
  const paul = randomUUID();
  const token = (sub: string, role = 'PATIENT') => jwt.sign({ sub, role });

  const get = (path: string, who: string | null = token(awa)) =>
    fetch(`${baseUrl}${path}`, { headers: who ? { authorization: `Bearer ${who}` } : {} });
  const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

  type InsightsBody = {
    period: { from: string; to: string };
    quality: Record<string, unknown>;
    stats: Record<string, number | null> | null;
    previousStats: Record<string, number | null> | null;
    insights: { type: string; evidenceIds: string[]; text: string }[];
    summary: string;
    disclaimer: string;
  };

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
        InsightsModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      // Sans modèle de langage (LLM_PROVIDER=none, le défaut) : les phrases sont les gabarits du moteur.
      .overrideProvider(LLM_PROVIDER)
      .useValue(null)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Seule l'horloge est figée (le serveur HTTP continue de fonctionner normalement).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    rows = [];
    profiles = new Map([
      [awa, { ...DEFAULT_PROFILE }],
      [paul, { ...DEFAULT_PROFILE }],
    ]);
    lastQuery = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /insights : jeu de référence (mêmes chiffres que le moteur)', () => {
    it('7 jours : pourcentages, statistiques, qualité, observations et phrases EXACTEMENT attendus', async () => {
      seedReference(awa);
      const res = await get('/insights?period=7');
      const body = await json<InsightsBody>(res);

      expect(res.status).toBe(200);
      // Du 28 septembre 00:00 au 5 octobre 00:00 à Kinshasa (UTC+1), rendu en UTC.
      expect(body.period).toEqual({
        from: '2026-09-27T23:00:00.000Z',
        to: '2026-10-04T23:00:00.000Z',
      });
      expect(body.stats).toMatchObject({
        count: 20,
        timeInRangePct: 70,
        timeAbovePct: 20,
        timeBelowPct: 10,
        meanMgDl: 141.25,
      });
      expect(body.stats!.sdMgDl).toBeCloseTo(EXPECTED.stats.sdMgDl, 10);
      expect(body.stats!.cvPercent).toBeCloseTo(EXPECTED.stats.cvPercent, 10);
      expect(body.previousStats).toMatchObject(EXPECTED.previousStats);
      expect(body.quality).toEqual(EXPECTED.quality);
      expect(body.insights).toEqual(expectedInsights(awa));
      // Résumé de la période (L3-06, contrat 0.3.0) : le texte écrit à la main pour la semaine de référence.
      expect(body.summary).toBe(EXPECTED.summary);
      expect(body.disclaimer).toBe(DISCLAIMER_FR);
    });

    it('chaque preuve est l’UUID d’une mesure du patient (« Voir les mesures concernées »)', async () => {
      seedReference(awa);
      const body = await json<InsightsBody>(await get('/insights?period=7'));
      const mine = new Set(rows.filter((r) => r.patientId === awa).map((r) => r.id));
      const evidence = body.insights.flatMap((i) => i.evidenceIds);
      expect(evidence.length).toBeGreaterThan(0);
      for (const id of evidence) {
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(mine.has(id)).toBe(true);
      }
    });

    it('période par défaut : 30 jours (du 5 septembre au 4 octobre inclus)', async () => {
      seedReference(awa);
      const body = await json<InsightsBody>(await get('/insights'));
      expect(body.period).toEqual({
        from: '2026-09-04T23:00:00.000Z',
        to: '2026-10-04T23:00:00.000Z',
      });
      expect(body.quality).toMatchObject({ daysInPeriod: 30, daysWithData: 10 });
    });

    it('lit la période ET la période précédente (comparaison), rien de plus ancien', async () => {
      seedReference(awa);
      await get('/insights?period=7');
      expect(lastQuery!.where.patientId).toBe(awa);
      expect(lastQuery!.where.deletedAt).toBeNull();
      expect(lastQuery!.where.measuredAt.gte.toISOString()).toBe('2026-09-20T23:00:00.000Z');
      expect(lastQuery!.where.measuredAt.lt.toISOString()).toBe('2026-10-04T23:00:00.000Z');
      // Seules les colonnes utiles au calcul sont lues (pas la note chiffrée, par exemple).
      expect(Object.keys(lastQuery!.select).sort()).toEqual(['id', 'measuredAt', 'valueMgDl']);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('règles du patient : seuils personnels et fuseau horaire', () => {
    it('seuils personnels (cible 80–160) : 50 % dans la cible au lieu de 70 %', async () => {
      seedReference(awa);
      profiles.set(awa, {
        ...DEFAULT_PROFILE,
        veryLowMgDl: 60,
        targetMinMgDl: 80,
        targetMaxMgDl: 160,
        veryHighMgDl: 220,
      });
      const body = await json<InsightsBody>(await get('/insights?period=7'));
      expect(body.stats!.timeInRangePct).toBe(50);
    });

    it('patient à New York (UTC−4 dans son profil) : mêmes résultats, période à SON minuit', async () => {
      seedReference(awa, -240);
      profiles.set(awa, { ...DEFAULT_PROFILE, timezoneOffsetMinutes: -240 });
      // « Maintenant » = 4 octobre, 23:30 à New York (5 octobre 03:30 UTC).
      vi.setSystemTime(NOW + (TZ_OFFSET_MINUTES + 240) * MINUTE);

      const body = await json<InsightsBody>(await get('/insights?period=7'));
      expect(body.period).toEqual({
        from: '2026-09-28T04:00:00.000Z', // 28 septembre, 00:00 à New York
        to: '2026-10-05T04:00:00.000Z',
      });
      expect(body.quality).toEqual(EXPECTED.quality);
      expect(body.insights).toEqual(expectedInsights(awa));
    });

    it('sans le fuseau du profil, le même patient aurait été mal analysé (créneau « soir » perdu)', async () => {
      seedReference(awa, -240);
      profiles.set(awa, { ...DEFAULT_PROFILE, timezoneOffsetMinutes: 60 }); // mauvais fuseau
      vi.setSystemTime(NOW + (TZ_OFFSET_MINUTES + 240) * MINUTE);
      const body = await json<InsightsBody>(await get('/insights?period=7'));
      expect(body.insights.map((i) => i.type)).not.toContain('TIME_OF_DAY_PATTERN');
    });

    it('décalage impossible en base : fuseau par défaut, analyse rendue, signalé sans donnée de santé', async () => {
      seedReference(awa);
      profiles.set(awa, { ...DEFAULT_PROFILE, timezoneOffsetMinutes: 5000 });
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      // Le journal de NestJS peut être silencieux dans un module de test : on lit aussi ses appels.
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
        written.push(String(message));
      });
      let body: InsightsBody;
      try {
        const res = await get('/insights?period=7');
        expect(res.status).toBe(200);
        body = await json<InsightsBody>(res);
      } finally {
        out.mockRestore();
        err.mockRestore();
        warn.mockRestore();
      }
      expect(body.insights).toEqual(expectedInsights(awa)); // UTC+1 par défaut = Kinshasa
      const logs = written.join('\n');
      expect(logs).toContain('Décalage horaire du profil invalide');
      for (const secret of [awa, '5000', '141', '240', '190']) expect(logs).not.toContain(secret);
    });

    it('pas encore de profil : seuils et fuseau par défaut, « données insuffisantes »', async () => {
      profiles.delete(awa);
      const res = await get('/insights?period=7');
      const body = await json<InsightsBody>(res);
      expect(res.status).toBe(200);
      expect(body).toMatchObject({ stats: null, previousStats: null, insights: [] });
      expect(body.quality).toMatchObject({ analyzable: false, score: 0, level: 'INSUFFICIENT' });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('données insuffisantes, supprimées, d’un autre patient', () => {
    it('9 mesures dans la période : pas de statistiques ni d’observations, qualité quand même', async () => {
      seedReference(awa);
      const week = rows.filter((r) => r.measuredAt.getTime() >= Date.UTC(2026, 8, 27, 23));
      rows = rows.filter((r) => !week.slice(9).includes(r));
      const body = await json<InsightsBody>(await get('/insights?period=7'));
      expect(body.stats).toBeNull();
      expect(body.previousStats).toBeNull();
      expect(body.insights).toEqual([]);
      expect(body.quality).toMatchObject({ analyzable: false, daysInPeriod: 7 });
      expect(body.disclaimer).toBe(DISCLAIMER_FR);
    });

    it('les mesures supprimées ne comptent pas', async () => {
      seedReference(awa);
      // On supprime la mesure très basse (50) : plus qu'une hypo, donc plus d'observation.
      rows.find((r) => r.id === uuidOf.get(`${awa}:J7-matin`))!.deletedAt = new Date(NOW);
      const body = await json<InsightsBody>(await get('/insights?period=7'));
      expect(body.stats!.count).toBe(19);
      expect(body.insights.map((i) => i.type)).not.toContain('REPEATED_HYPO');
    });

    it('PROPRIÉTÉ : les mesures d’un autre patient ne comptent jamais', async () => {
      seedReference(paul);
      const forAwa = await json<InsightsBody>(await get('/insights?period=7'));
      expect(forAwa.stats).toBeNull();
      expect(forAwa.insights).toEqual([]);

      const forPaul = await json<InsightsBody>(await get('/insights?period=7', token(paul)));
      expect(forPaul.stats!.count).toBe(20);
      expect(forPaul.insights).toEqual(expectedInsights(paul));
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /quality', () => {
    it('score de la semaine de référence : 86, « Bonne », détail des trois composantes', async () => {
      seedReference(awa);
      const res = await get('/quality?period=7');
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual(EXPECTED.quality);
    });

    it('même score que dans GET /insights, pour chaque période', async () => {
      seedReference(awa);
      for (const period of [7, 14, 30, 90]) {
        const quality = await json(await get(`/quality?period=${period}`));
        const insights = await json<InsightsBody>(await get(`/insights?period=${period}`));
        expect(quality).toEqual(insights.quality);
        expect(quality.daysInPeriod).toBe(period);
      }
    });

    it('patient à New York (UTC−4) : les jours sont comptés à SON heure', async () => {
      seedReference(awa, -240);
      profiles.set(awa, { ...DEFAULT_PROFILE, timezoneOffsetMinutes: -240 });
      vi.setSystemTime(NOW + (TZ_OFFSET_MINUTES + 240) * MINUTE);
      expect(await json(await get('/quality?period=7'))).toEqual(EXPECTED.quality);
    });

    it('fraîcheur : dernière mesure il y a 4 jours ⇒ 50', async () => {
      seedReference(awa);
      // La dernière mesure est celle du 5 octobre à 08:00 (07:00 UTC) ; on se place 4 jours après.
      vi.setSystemTime(Date.UTC(2026, 9, 5, 7) + 4 * DAY);
      expect((await json(await get('/quality?period=14'))).freshness).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('validation et autorisations', () => {
    it.each(['/insights', '/quality'])(
      '%s : période invalide ⇒ 400 au format habituel',
      async (path) => {
        for (const period of ['10', 'abc', '7.5', '-7']) {
          const res = await get(`${path}?period=${period}`);
          expect(res.status).toBe(400);
          const body = await json<{ message: string; issues: { path: string }[] }>(res);
          expect(body.message).toBe('Données invalides');
          expect(body.issues[0]!.path).toBe('period');
        }
      },
    );

    it.each(['/insights', '/quality'])('%s : sans jeton ⇒ 401', async (path) => {
      expect((await get(path, null)).status).toBe(401);
    });

    it.each(['/insights', '/quality'])(
      '%s : réservé aux patients (médecin, admin ⇒ 403)',
      async (path) => {
        seedReference(awa);
        for (const role of ['DOCTOR', 'ADMIN']) {
          expect((await get(path, token(awa, role))).status).toBe(403);
        }
      },
    );

    it('aucune donnée de santé dans les journaux', async () => {
      seedReference(awa);
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      try {
        await get('/insights?period=7');
        await get('/quality?period=30');
        await get('/insights?period=10'); // 400
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      const logs = written.join('\n');
      for (const secret of [awa, '141.25', '240', uuidOf.get(`${awa}:J4-soir`)!]) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});
