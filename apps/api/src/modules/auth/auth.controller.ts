import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  refreshSchema,
  registerDoctorSchema,
  registerPatientSchema,
  verifyEmailSchema,
  type LoginInput,
  type RegisterDoctorInput,
  type RegisterPatientInput,
} from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

// Limites par adresse IP, plus strictes que la limite globale (120/min) : routes publiques et sensibles.
const REGISTER_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const VERIFY_LIMIT = { default: { limit: 10, ttl: 60_000 } };
// Connexion : la protection principale est le verrouillage du COMPTE (5 échecs) ; ceci limite en plus par IP.
const LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const REFRESH_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/**
 * Le contrôleur ne contient aucune logique métier : il valide l'entrée avec un schéma Zod de @glyka/shared
 * (réponse 400 + détail des champs si invalide), puis délègue à AuthService (inscription)
 * ou SessionService (connexion, rafraîchissement, déconnexion).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

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

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_LIMIT)
  @ApiOperation({ summary: 'Se connecter (L1-02)' })
  @ApiOkResponse({
    description: 'Jetons + { id, role, profileCompleted, doctorVerificationStatus }',
  })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Email ou mot de passe incorrect (message identique)' })
  @ApiForbiddenResponse({ description: 'Adresse email non vérifiée (EMAIL_NOT_VERIFIED)' })
  @ApiTooManyRequestsResponse({
    description: 'Compte verrouillé 10 min après 5 échecs (ACCOUNT_LOCKED)',
  })
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.sessions.login(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(REFRESH_LIMIT)
  @ApiOperation({ summary: 'Obtenir de nouveaux jetons ; l’ancien jeton ne marche plus (L1-02)' })
  @ApiOkResponse({ description: 'Nouvelle paire de jetons' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Jeton invalide, expiré ou réutilisé (TOKEN_INVALID)' })
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }) {
    return this.sessions.refresh(body.refreshToken);
  }

  /** Pas de @Public : il faut un jeton d'accès valide (JwtAuthGuard), donc tout utilisateur connecté. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Se déconnecter : révoque la session (L1-02)' })
  @ApiNoContentResponse({ description: 'Session terminée' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Jeton d’accès absent ou invalide' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<void> {
    await this.sessions.logout(user.id, body.refreshToken);
  }

  // TODO(L1-03) POST /auth/forgot-password · POST /auth/reset-password
}
