import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Taille maximale d'un corps JSON (voir le lot de synchronisation, L8-04). */
const JSON_BODY_LIMIT = '1mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Corps JSON jusqu'à 1 Mo (100 Ko par défaut) : un lot de synchronisation légitime de 200 opérations
  // avec des notes de 500 caractères pèse environ 300 Ko (L8-04). Les fichiers d'import passent par
  // multer (5 Mo), pas par ici.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(helmet());
  // CORS : seul le portail web peut appeler l'API depuis un navigateur. En développement, on autorise aussi
  // l'aperçu web de l'app mobile (Expo, port 8081). Les applications natives ne sont pas concernées par CORS.
  const allowedOrigins = [process.env.PORTAL_URL ?? 'http://localhost:5173'];
  if (process.env.NODE_ENV !== 'production') allowedOrigins.push('http://localhost:8081');
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('Glyka API')
    .setDescription('API du MVP Glyka — contrat gelé en v0 le jour 1 (voir docs/api)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
