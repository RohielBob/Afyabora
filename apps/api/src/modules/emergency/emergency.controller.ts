import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  emergencyCardSchema,
  type EmergencyCardInput,
  type EmergencyCardPublic,
  type EmergencyCardResponse,
  type EmergencyQrResponse,
} from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EmergencyService } from './emergency.service';

/** Régénérer le QR à la chaîne n'a aucun usage légitime : 10 par minute au plus. */
const REGENERATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Page publique, sans compte : 10 ouvertures par minute et par adresse IP. Un secouriste l'ouvre une fois
 * (ou la recharge) ; un robot qui essaie des jetons au hasard est arrêté (et un jeton fait 32 octets
 * aléatoires : il n'y a rien à deviner).
 */
export const PUBLIC_CARD_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Carte d'urgence du patient (L6-05, CDC F10). Le contrôleur ne contient aucune logique : il valide l'entrée
 * avec le schéma de @glyka/shared et délègue à EmergencyService. Le patient est toujours celui du jeton.
 */
@ApiTags('emergency')
@ApiBearerAuth()
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergency: EmergencyService) {}

  @Get()
  @Roles('PATIENT')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lire ma carte d’urgence (L6-05)' })
  @ApiOkResponse({
    description: 'Carte d’urgence (créée vide et désactivée à la première lecture)',
  })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Profil pas encore créé' })
  get(@CurrentUser() user: AuthUser): Promise<EmergencyCardResponse> {
    return this.emergency.get(user.id);
  }

  @Put()
  @Roles('PATIENT')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Modifier ma carte d’urgence (L6-05)' })
  @ApiOkResponse({ description: 'Carte enregistrée. enabled: false rend le QR inopérant.' })
  @ApiBadRequestResponse({ description: 'Champ invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Profil pas encore créé' })
  save(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(emergencyCardSchema)) input: EmergencyCardInput,
  ): Promise<EmergencyCardResponse> {
    return this.emergency.save(user.id, input);
  }

  @Post('regenerate')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.OK)
  @Throttle(REGENERATE_LIMIT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Générer un nouveau QR d’urgence (L6-05)' })
  @ApiOkResponse({
    description: 'Nouveau jeton (montré une seule fois) ; l’ancien QR ne marche plus',
  })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Profil pas encore créé' })
  @ApiTooManyRequestsResponse({ description: 'Trop de QR générés en une minute' })
  regenerate(@CurrentUser() user: AuthUser): Promise<EmergencyQrResponse> {
    return this.emergency.regenerate(user.id);
  }
}

/**
 * Page publique de la carte d'urgence (L6-05, CDC F10) : GET /e/:token, SANS compte (c'est son but).
 * Le portail demande d'abord « Je suis un professionnel de santé ou un secouriste » avant d'appeler cette
 * route. Réponse jamais mise en cache, jamais indexée par un moteur de recherche.
 */
@ApiTags('emergency')
@Controller('e')
export class PublicEmergencyController {
  constructor(private readonly emergency: EmergencyService) {}

  @Get(':token')
  @Public()
  @Throttle(PUBLIC_CARD_LIMIT)
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Lire une carte d’urgence (page publique, L6-05)' })
  @ApiOkResponse({ description: 'Uniquement les champs choisis par le patient. Aucun historique.' })
  @ApiNotFoundResponse({ description: 'QR inconnu, remplacé ou carte désactivée' })
  @ApiTooManyRequestsResponse({ description: 'Trop d’ouvertures depuis cette adresse' })
  read(@Param('token') token: string, @Ip() ip: string): Promise<EmergencyCardPublic> {
    return this.emergency.readPublic(token, ip);
  }
}
