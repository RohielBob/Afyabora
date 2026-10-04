// Exporte le contrat OpenAPI vers docs/api/openapi.json (ticket L0-07).
// Usage : pnpm --filter @glyka/api build && pnpm --filter @glyka/api openapi:export
// Nécessite une base joignable (docker compose up -d db) car l'application démarre réellement.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder().setTitle('Glyka API').setVersion('0.1.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, config);
  const out = resolve(__dirname, '../../../../docs/api/openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`OpenAPI exporté : ${out}`);
}
void main();
