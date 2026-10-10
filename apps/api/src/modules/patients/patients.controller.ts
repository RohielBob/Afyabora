import { Body, Controller, Get, Put } from '@nestjs/common';
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
import { patientProfileSchema, type PatientProfileInput } from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PatientsService } from './patients.service';

/**
 * Routes « /me » du patient. L'utilisateur concerné est toujours celui du jeton (@CurrentUser) :
 * aucune route ne prend d'identifiant de patient, donc impossible de viser le profil d'un autre.
 */
@ApiTags('patients')
@ApiBearerAuth()
@Controller('me')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('profile')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lire mon profil médical (L1-05)' })
  @ApiOkResponse({ description: 'Profil du patient' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: "Profil pas encore créé : lancer l'assistant de profil" })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.patients.getProfile(user.id);
  }

  @Put('profile')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Créer ou remplacer mon profil médical et mes seuils (L1-05)' })
  @ApiOkResponse({ description: 'Profil enregistré' })
  @ApiBadRequestResponse({ description: 'Données invalides (ex. seuils dans le mauvais ordre)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  putProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(patientProfileSchema)) body: PatientProfileInput,
  ) {
    return this.patients.upsertProfile(user.id, body);
  }

  // TODO(L1-14) GET /me/export : export JSON/CSV de ses données (P1)
  // TODO(L1-14) DELETE /me : suppression du compte et des données (P1)
}
