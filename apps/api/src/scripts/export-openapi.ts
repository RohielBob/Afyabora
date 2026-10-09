// Exporte l'OpenAPI GÉNÉRÉ par le code vers docs/api/openapi.generated.json (ticket L0-07).
// Ce n'est PAS le contrat : le contrat figé est docs/api/openapi.v0.json (écrit à la main, voir docs/api/README.md).
// Usage : pnpm --filter @glyka/api build && pnpm --filter @glyka/api openapi:export
// Utile pour comparer le code au contrat. Le test openapi-drift.test.ts fait cette comparaison automatiquement.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('Glyka API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const out = resolve(__dirname, '../../../../docs/api/openapi.generated.json');
  writeFileSync(out, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI exporté : ${out}`);
}
void main();
