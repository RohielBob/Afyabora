// Ticket L1-04 : chaque route RÉELLEMENT codée porte les rôles que le contrat lui attribue (extension « x-roles »).
//  - x-roles = [PUBLIC]            → la route doit être @Public() (et sans @Roles) ;
//  - x-roles = [PATIENT, DOCTOR…]  → la route ne doit PAS être publique et doit porter exactement @Roles(...).
// Un échec veut dire : route codée sans @Roles / @Public, ou avec d'autres rôles que le contrat.
// Complète openapi-drift.test.ts (qui vérifie que la route existe dans le contrat).
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';

interface CodedRoute {
  key: string; // « POST /auth/logout » ; un paramètre devient « {} » (son nom n'a pas d'importance)
  isPublic: boolean;
  roles: string[];
}

const normalize = (path: string) =>
  ('/' + path)
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:[^/]+/g, '{}') || '/';

/** Parcourt les contrôleurs de l'application et lit les décorateurs de chaque méthode. */
function codedRoutes(container: ModulesContainer): CodedRoute[] {
  const routes: CodedRoute[] = [];
  for (const module of container.values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!controller) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue; // méthode ordinaire, pas une route
        const path = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
        routes.push({
          key: `${RequestMethod[method]} ${normalize(`${base}/${path}`)}`,
          isPublic: Boolean(
            Reflect.getMetadata(IS_PUBLIC_KEY, handler) ??
            Reflect.getMetadata(IS_PUBLIC_KEY, controller),
          ),
          roles: [
            ...((Reflect.getMetadata(ROLES_KEY, handler) ??
              Reflect.getMetadata(ROLES_KEY, controller) ??
              []) as string[]),
          ].sort(),
        });
      }
    }
  }
  return routes;
}

describe('contrat OpenAPI : rôles de chaque route codée', () => {
  it('chaque route porte @Public() ou exactement les @Roles du contrat', async () => {
    // Même configuration minimale que openapi-drift.test.ts (validée au chargement d'AppModule).
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://glyka:test@localhost:5432/glyka',
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
      FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      const contract = JSON.parse(
        readFileSync(resolve(__dirname, '../../../docs/api/openapi.v0.json'), 'utf-8'),
      ) as { paths: Record<string, Record<string, { 'x-roles'?: string[] }>> };
      const expected = new Map<string, string[]>();
      for (const [path, item] of Object.entries(contract.paths)) {
        for (const [method, operation] of Object.entries(item)) {
          if (!operation?.['x-roles']) continue;
          expected.set(
            `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`,
            [...operation['x-roles']].sort(),
          );
        }
      }

      const routes = codedRoutes(moduleRef.get(ModulesContainer));
      expect(routes.length).toBeGreaterThan(0); // au minimum GET /health

      const problems: string[] = [];
      for (const route of routes) {
        const roles = expected.get(route.key);
        if (!roles) {
          problems.push(`${route.key} : absente du contrat (voir openapi-drift.test.ts)`);
        } else if (roles.includes('PUBLIC')) {
          if (!route.isPublic || route.roles.length > 0) {
            problems.push(`${route.key} : le contrat la dit PUBLIC → @Public() sans @Roles`);
          }
        } else if (route.isPublic) {
          problems.push(
            `${route.key} : publique dans le code, réservée à ${roles} dans le contrat`,
          );
        } else if (route.roles.join() !== roles.join()) {
          problems.push(
            `${route.key} : @Roles(${route.roles.join(', ') || 'aucun'}) au lieu de ${roles.join(', ')}`,
          );
        }
      }
      expect(problems).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });
});
