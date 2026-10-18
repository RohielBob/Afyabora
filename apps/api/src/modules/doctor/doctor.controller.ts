import { Controller, Get, Ip, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { listQuerySchema, type ListQuery } from '@glyka/shared';
import { uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DoctorService } from './doctor.service';
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

  // Route suivante du module (voir README.md) :
  // TODO(L6-04) GET /doctor/sessions/:id/report (rapport PDF, catégorie REPORT_DOWNLOAD)
}
