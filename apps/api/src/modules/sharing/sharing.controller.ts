import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  accessLogQuerySchema,
  claimShareSchema,
  createShareSchema,
  type AccessLogQuery,
  type CreateShareInput,
} from '@glyka/shared';
import { uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { ShareClaimService } from './share-claim.service';
import { ShareLifecycleService } from './share-lifecycle.service';
import { SharingService } from './sharing.service';

/** Créer des QR à la chaîne n'a aucun usage légitime : 10 par minute au plus. */
const CREATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Rotation : l'application en demande une par minute ; la marge couvre les nouvelles tentatives après une
 * coupure réseau et un second écran ouvert. 30 par minute au plus.
 */
const ROTATE_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/**
 * Scan : la protection principale est le blocage après 5 scans RATÉS (claim-limiter.ts) ; ceci limite en
 * plus le nombre total de scans par adresse IP (un cabinet scanne rarement plus d'un QR par minute).
 */
const CLAIM_LIMIT = { default: { limit: 20, ttl: 60_000 } };

const SESSION_ID = uuidParam();

/**
 * Partage par QR dynamique (lot L5, ADR-0003). Le contrôleur ne contient aucune logique : il valide l'entrée
 * avec le schéma de @glyka/shared et délègue à SharingService. Le patient est toujours celui du jeton
 * (@CurrentUser) : aucune route ne prend d'identifiant de patient.
 */
@ApiTags('sharing')
@ApiBearerAuth()
@Controller('shares')
export class SharingController {
  constructor(
    private readonly sharing: SharingService,
    private readonly claims: ShareClaimService,
    private readonly lifecycle: ShareLifecycleService,
    private readonly audit: AuditService,
  ) {}

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

  @Get(':id/token')
  @Roles('PATIENT')
  @Throttle(ROTATE_LIMIT)
  @ApiOperation({ summary: 'Obtenir le jeton courant du QR (rotation 60 s, L5-02)' })
  @ApiOkResponse({ description: 'Nouveau jeton, usage unique ; les précédents ne servent plus' })
  @ApiBadRequestResponse({ description: 'Identifiant invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Session introuvable (ou qui ne vous appartient pas)' })
  @ApiConflictResponse({
    description: "La session n'est plus en attente de scan (code SESSION_NOT_PENDING)",
  })
  @ApiTooManyRequestsResponse({ description: 'Trop de rotations en une minute' })
  rotate(@CurrentUser() user: AuthUser, @Param('id', SESSION_ID) id: string) {
    return this.sharing.rotate(user.id, id);
  }

  @Post('claim')
  @Roles('DOCTOR')
  @HttpCode(HttpStatus.OK)
  @Throttle(CLAIM_LIMIT)
  @ApiOperation({ summary: 'Scanner le QR d’un patient (médecin approuvé, L5-03)' })
  @ApiOkResponse({ description: 'Accès ouvert : la durée démarre maintenant' })
  @ApiBadRequestResponse({ description: 'Corps invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton de connexion absent ou invalide' })
  @ApiForbiddenResponse({
    description: 'Réservé aux médecins approuvés (code DOCTOR_NOT_APPROVED)',
  })
  @ApiNotFoundResponse({
    description: 'QR invalide, expiré ou déjà utilisé (code TOKEN_INVALID, sans autre précision)',
  })
  @ApiTooManyRequestsResponse({ description: 'Trop de scans ratés ou trop de scans en une minute' })
  claim(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(claimShareSchema)) body: { token: string },
    @Ip() ip: string | undefined,
  ) {
    return this.claims.claim(user.id, body.token, ip);
  }

  @Get(':id/status')
  @Roles('PATIENT')
  @ApiOperation({ summary: "Suivre l'état d'une session (L5-04)" })
  @ApiOkResponse({ description: 'État courant ; le serveur est la seule horloge de référence' })
  @ApiBadRequestResponse({ description: 'Identifiant invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Session introuvable (ou qui ne vous appartient pas)' })
  status(@CurrentUser() user: AuthUser, @Param('id', SESSION_ID) id: string) {
    return this.lifecycle.status(user.id, id);
  }

  @Delete(':id')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mettre fin à l'accès (L5-04)" })
  @ApiNoContentResponse({
    description: "Accès révoqué : le médecin n'a plus accès dès sa requête suivante",
  })
  @ApiBadRequestResponse({ description: 'Identifiant invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Session introuvable (ou qui ne vous appartient pas)' })
  async revoke(@CurrentUser() user: AuthUser, @Param('id', SESSION_ID) id: string) {
    await this.lifecycle.revoke(user.id, id);
  }

  @Get('log')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Qui a consulté mes données (L5-05)' })
  @ApiOkResponse({ description: "Journal d'accès, du plus récent au plus ancien" })
  @ApiBadRequestResponse({ description: 'Taille de page ou curseur invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  log(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accessLogQuerySchema)) query: AccessLogQuery,
  ) {
    return this.audit.list(user.id, query);
  }
}
