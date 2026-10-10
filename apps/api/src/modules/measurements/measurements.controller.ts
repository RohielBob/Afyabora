import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createMeasurementSchema,
  listQuerySchema,
  updateMeasurementSchema,
  type CreateMeasurementInput,
  type ListQuery,
  type UpdateMeasurementInput,
} from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MeasurementsService } from './measurements.service';

/** Identifiant de mesure dans l'URL : un UUID, sinon 400 au même format que les autres erreurs. */
const MEASUREMENT_ID = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      message: 'Données invalides',
      issues: [{ path: 'id', message: 'Identifiant invalide.' }],
    }),
});

/**
 * Mesures de glycémie du patient (L2-01). Le contrôleur ne contient aucune logique : il valide l'entrée
 * avec les schémas de @glyka/shared puis délègue à MeasurementsService. Le patient est toujours celui du
 * jeton (@CurrentUser) : aucune route ne prend d'identifiant de patient.
 */
@ApiTags('measurements')
@ApiBearerAuth()
@Controller('measurements')
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @Get()
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lister mes mesures (période, pagination par curseur) (L2-01)' })
  @ApiOkResponse({
    description: 'Mesures, de la plus récente à la plus ancienne (sans les supprimées)',
  })
  @ApiBadRequestResponse({ description: 'Paramètres invalides (période, curseur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.measurements.list(user.id, query);
  }

  /** 201 si la mesure est créée ; 200 si elle existait déjà avec cet identifiant (rejeu hors-ligne). */
  @Post()
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Enregistrer une mesure (identifiant généré par le téléphone) (L2-01)' })
  @ApiCreatedResponse({ description: 'Mesure créée' })
  @ApiOkResponse({ description: 'Mesure déjà enregistrée avec cet identifiant : aucune création' })
  @ApiBadRequestResponse({ description: 'Données invalides (ex. date dans le futur)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiUnprocessableEntityResponse({
    description: 'Valeur inhabituelle non confirmée (UNUSUAL_VALUE)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMeasurementSchema)) body: CreateMeasurementInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { measurement, created } = await this.measurements.create(user.id, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return measurement;
  }

  @Put(':id')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Modifier une mesure (L2-01)' })
  @ApiOkResponse({ description: 'Mesure modifiée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Mesure introuvable (ou supprimée)' })
  @ApiUnprocessableEntityResponse({
    description: 'Valeur inhabituelle non confirmée (UNUSUAL_VALUE)',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', MEASUREMENT_ID) id: string,
    @Body(new ZodValidationPipe(updateMeasurementSchema)) body: UpdateMeasurementInput,
  ) {
    return this.measurements.update(user.id, id, body);
  }

  @Delete(':id')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une mesure (L2-01)' })
  @ApiNoContentResponse({ description: 'Mesure supprimée (204 aussi si elle l’était déjà)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Mesure introuvable' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', MEASUREMENT_ID) id: string,
  ): Promise<void> {
    await this.measurements.remove(user.id, id);
  }
}
