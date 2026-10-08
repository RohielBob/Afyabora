import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { HealthModule } from '../src/modules/health/health.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Faux accès base de données : ces tests n'ont besoin d'aucune vraie base (ils tournent partout, CI comprise).
const queryRaw = vi.fn();
class FakePrismaModule {}

describe('GET /health', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // Même garde globale que l'application réelle : /health doit rester public malgré elle.
        JwtModule.register({ global: true, secret: 'secret-de-test-uniquement-0123456789abcdef' }),
        {
          module: FakePrismaModule,
          global: true,
          providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
          exports: [PrismaService],
        },
        HealthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
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
    queryRaw.mockReset();
  });

  it('répond 200 sans jeton quand la base est joignable', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as { status: string; time: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('ne renvoie aucune autre information que « status » et « time »', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['status', 'time']);
  });

  it('répond 503 sans détail interne quand la base est injoignable', async () => {
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));

    const res = await fetch(`${baseUrl}/health`);
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: 'error', message: 'Service indisponible' });
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('secret');
  });
});
