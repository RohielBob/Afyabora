import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createLifeEventSchema,
  listQuerySchema,
  updateLifeEventSchema,
  type CreateLifeEventInput,
  type ListQuery,
  type UpdateLifeEventInput,
} from '@glyka/shared';
import { uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EventsService } from './events.service';

/** Identifiant d'événement dans l'URL : un UUID, sinon 400 au même format que les autres erreurs. */
const EVENT_ID = uuidParam();

/**
 * Événements de vie du patient (L2-02) : repas, activité, traitement déclaré. Aucune logique ici :
 * validation avec les schémas de @glyka/shared, puis EventsService. Le patient vient du jeton.
 */
@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lister mes événements (période, pagination par curseur) (L2-02)' })
  @ApiOkResponse({ description: 'Événements, du plus récent au plus ancien (sans les supprimés)' })
  @ApiBadRequestResponse({ description: 'Paramètres invalides (période, curseur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.events.list(user.id, query);
  }

  /** 201 si l'événement est créé ; 200 s'il existait déjà avec cet identifiant (rejeu hors-ligne). */
  @Post()
  @Roles('PATIENT')
  @ApiOperation({
    summary: 'Enregistrer un événement (identifiant généré par le téléphone) (L2-02)',
  })
  @ApiCreatedResponse({ description: 'Événement créé' })
  @ApiOkResponse({ description: 'Déjà enregistré avec cet identifiant : aucune création' })
  @ApiBadRequestResponse({ description: 'Données invalides (ex. date dans le futur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLifeEventSchema)) body: CreateLifeEventInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { event, created } = await this.events.create(user.id, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return event;
  }

  @Put(':id')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Modifier un événement (L2-02)' })
  @ApiOkResponse({ description: 'Événement modifié' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Événement introuvable (ou supprimé)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', EVENT_ID) id: string,
    @Body(new ZodValidationPipe(updateLifeEventSchema)) body: UpdateLifeEventInput,
  ) {
    return this.events.update(user.id, id, body);
  }

  @Delete(':id')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un événement (L2-02)' })
  @ApiNoContentResponse({ description: 'Événement supprimé (204 aussi s’il l’était déjà)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Événement introuvable' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', EVENT_ID) id: string): Promise<void> {
    await this.events.remove(user.id, id);
  }
}
