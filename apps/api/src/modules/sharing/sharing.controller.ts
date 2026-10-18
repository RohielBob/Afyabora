import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createShareSchema, type CreateShareInput } from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SharingService } from './sharing.service';

/** Créer des QR à la chaîne n'a aucun usage légitime : 10 par minute au plus. */
const CREATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Partage par QR dynamique (lot L5, ADR-0003). Le contrôleur ne contient aucune logique : il valide l'entrée
 * avec le schéma de @glyka/shared et délègue à SharingService. Le patient est toujours celui du jeton
 * (@CurrentUser) : aucune route ne prend d'identifiant de patient.
 */
@ApiTags('sharing')
@ApiBearerAuth()
@Controller('shares')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Post()
  @Roles('PATIENT')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(CREATE_LIMIT)
  @ApiOperation({ summary: 'Créer une session de partage et son premier QR (L5-01)' })
  @ApiCreatedResponse({ description: 'Session créée (en attente de scan) avec son premier jeton' })
  @ApiBadRequestResponse({
    description: 'Catégories ou durée invalides, ou profil médical manquant',
  })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiTooManyRequestsResponse({ description: 'Trop de créations en une minute' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createShareSchema)) body: CreateShareInput,
  ) {
    return this.sharing.create(user.id, body);
  }

  // Routes suivantes du module (voir README.md) :
  // TODO(L5-02) GET /shares/:id/token : nouveau jeton (rotation toutes les 60 s) tant que la session est `PENDING`
  // TODO(L5-04, L5-06) GET /shares/:id/status : état (PENDING / ACTIVE / EXPIRED / REVOKED) pour l'app patient
  // TODO(L5-04) DELETE /shares/:id : révocation immédiate
  // TODO(L5-03) POST /shares/claim : le médecin consomme le jeton (médecin approuvé uniquement)
  // TODO(L5-05) GET /shares/log : journal d'accès du patient
}
