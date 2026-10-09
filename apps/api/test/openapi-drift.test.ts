// Toute route RÉELLEMENT implémentée dans l'API doit être décrite par le contrat gelé (ticket L0-07).
// L'inverse n'est pas exigé : le contrat décrit aussi les routes pas encore codées.
// Un échec veut dire : route ajoutée, renommée ou déplacée sans mettre à jour docs/api/openapi.v0.json.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** « GET /measurements/{id} » : le nom du paramètre n'a pas d'importance, seule sa position compte. */
const routesOf = (document: { paths: Record<string, Record<string, unknown>> }): string[] =>
  Object.entries(document.paths)
    .flatMap(([path, item]) =>
      METHODS.filter((method) => item[method]).map(
        (method) => `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{}')}`,
      ),
    )
    .sort();

describe('contrat OpenAPI : écart avec le code', () => {
  it('toute route implémentée est décrite dans docs/api/openapi.v0.json', async () => {
    // Configuration minimale valide : validée par validateEnv au chargement du module.
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://glyka:test@localhost:5432/glyka',
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
      FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    });
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/prisma/prisma.service');

    // Pas de vraie base : on remplace le service Prisma par un objet vide.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();

    try {
      const generated = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      const frozen = JSON.parse(
        readFileSync(resolve(__dirname, '../../../docs/api/openapi.v0.json'), 'utf-8'),
      );

      const implemented = routesOf(generated as never);
      const described = new Set(routesOf(frozen));
      const undocumented = implemented.filter((route) => !described.has(route));

      expect(implemented.length).toBeGreaterThan(0); // au minimum GET /health
      expect(undocumented).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
