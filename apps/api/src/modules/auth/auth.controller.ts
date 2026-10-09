import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  registerDoctorSchema,
  registerPatientSchema,
  verifyEmailSchema,
  type RegisterDoctorInput,
  type RegisterPatientInput,
} from '@glyka/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

// Limites par adresse IP, plus strictes que la limite globale (120/min) : routes publiques et sensibles.
const REGISTER_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const VERIFY_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Le contrôleur ne contient aucune logique métier : il valide l'entrée avec un schéma Zod de @glyka/shared
 * (réponse 400 + détail des champs si invalide), puis délègue à AuthService.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(REGISTER_LIMIT)
  @ApiOperation({ summary: 'Créer un compte patient (L1-01)' })
  @ApiAcceptedResponse({ description: 'Toujours 202, même si l’adresse existe déjà' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives' })
  register(@Body(new ZodValidationPipe(registerPatientSchema)) body: RegisterPatientInput) {
    return this.auth.registerPatient(body);
  }

  @Public()
  @Post('register-doctor')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(REGISTER_LIMIT)
  @ApiOperation({ summary: 'Créer un compte médecin en attente d’approbation (L1-01)' })
  @ApiAcceptedResponse({ description: 'Toujours 202, même si l’adresse existe déjà' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives' })
  registerDoctor(@Body(new ZodValidationPipe(registerDoctorSchema)) body: RegisterDoctorInput) {
    return this.auth.registerDoctor(body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle(VERIFY_LIMIT)
  @ApiOperation({ summary: 'Vérifier l’adresse email avec le jeton reçu par email (L1-01)' })
  @ApiOkResponse({ description: 'Adresse vérifiée' })
  @ApiBadRequestResponse({ description: 'Jeton invalide, expiré ou déjà utilisé (TOKEN_INVALID)' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives' })
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }

  // TODO(L1-02) POST /auth/login · POST /auth/refresh · POST /auth/logout
  // TODO(L1-03) POST /auth/forgot-password · POST /auth/reset-password
}
