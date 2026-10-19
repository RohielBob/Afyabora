import { Controller, Get, Header, Ip, Param, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { listQuerySchema, reportQuerySchema, type ListQuery } from '@glyka/shared';
import type { Response } from 'express';
import { uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DoctorService } from './doctor.service';
import type { ReportDays } from '../reports/report-data';
import { REPORT_LIMIT, sendPdf } from '../reports/reports.controller';
import { DoctorRecordService } from './record.service';

const SESSION_ID = uuidParam();

/** Refus communs aux routes du dossier partagé (L5-12). */
const RECORD_FORBIDDEN =
  'Médecin non approuvé (DOCTOR_NOT_APPROVED), accès arrêté (SESSION_REVOKED) ou échu ' +
  '(SESSION_EXPIRED), catégorie non partagée (CATEGORY_NOT_SHARED), ou session d’un autre médecin';

/**
 * Portail médecin (lot L5). Le contrôleur ne contient aucune logique : il délègue aux services. Le
 * médecin est toujours celui du jeton (@CurrentUser).
 */
@ApiTags('doctor')
@ApiBearerAuth()
@Controller('doctor')
export class DoctorController {
  constructor(
    private readonly doctor: DoctorService,
    private readonly record: DoctorRecordService,
  ) {}

  @Get('sessions')
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Mes patients partagés (L5-11)' })
  @ApiOkResponse({ description: 'Sessions du médecin : en cours d’abord, puis les plus récentes' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({
    description: 'Réservé aux médecins approuvés (code DOCTOR_NOT_APPROVED)',
  })
  sessions(@CurrentUser() user: AuthUser) {
    return this.doctor.listSessions(user.id);
  }

  @Get('sessions/:id/summary')
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Dossier partagé : identité limitée, qualité, statistiques (L5-12)' })
  @ApiOkResponse({
    description: 'Résumé des 30 derniers jours ; observations si le résumé est partagé',
  })
  @ApiBadRequestResponse({ description: 'Identifiant invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: RECORD_FORBIDDEN })
  @ApiNotFoundResponse({ description: 'Session introuvable' })
  summary(
    @CurrentUser() user: AuthUser,
    @Param('id', SESSION_ID) id: string,
    @Ip() ip: string | undefined,
  ) {
    return this.record.summary(user.id, id, ip);
  }

  @Get('sessions/:id/measurements')
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Dossier partagé : glycémies (catégorie GLUCOSE_HISTORY) (L5-12)' })
  @ApiOkResponse({ description: 'Mesures, de la plus récente à la plus ancienne, par curseur' })
  @ApiBadRequestResponse({ description: 'Identifiant ou paramètres invalides (période, curseur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: RECORD_FORBIDDEN })
  @ApiNotFoundResponse({ description: 'Session introuvable' })
  measurements(
    @CurrentUser() user: AuthUser,
    @Param('id', SESSION_ID) id: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
    @Ip() ip: string | undefined,
  ) {
    return this.record.measurements(user.id, id, query, ip);
  }

  @Get('sessions/:id/timeline')
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Dossier partagé : chronologie des catégories partagées (L5-12)' })
  @ApiOkResponse({
    description: 'Mesures, repas, activités et traitements partagés, du plus récent au plus ancien',
  })
  @ApiBadRequestResponse({ description: 'Identifiant ou paramètres invalides (période, curseur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: RECORD_FORBIDDEN })
  @ApiNotFoundResponse({ description: 'Session introuvable' })
  timeline(
    @CurrentUser() user: AuthUser,
    @Param('id', SESSION_ID) id: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
    @Ip() ip: string | undefined,
  ) {
    return this.record.timeline(user.id, id, query, ip);
  }

  @Get('sessions/:id/report')
  @Roles('DOCTOR')
  @Throttle(REPORT_LIMIT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Dossier partagé : rapport PDF (catégorie REPORT_DOWNLOAD), téléchargement journalisé (L6-02)',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Rapport PDF ; une ligne REPORT_DOWNLOADED dans le journal du patient',
  })
  @ApiBadRequestResponse({ description: 'Identifiant ou période invalide (14, 30 ou 90)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: RECORD_FORBIDDEN })
  @ApiNotFoundResponse({ description: 'Session introuvable' })
  @ApiTooManyRequestsResponse({ description: 'Trop de rapports demandés en une minute' })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id', SESSION_ID) id: string,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: { period: number },
    @Ip() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendPdf(res, await this.record.report(user.id, id, query.period as ReportDays, ip));
  }
}
