import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTooManyRequestsResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { deleteAccountSchema, patientProfileSchema, type PatientProfileInput } from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccountService } from './account.service';
import { PatientsService } from './patients.service';

// Limites par adresse IP (L1-14) : l'export est lourd ; la suppression redemande le mot de passe,
// on empêche donc de le deviner en boucle avec un jeton volé.
const EXPORT_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const DELETE_LIMIT = { default: { limit: 5, ttl: 60_000 } };

/**
 * Routes « /me » du patient. L'utilisateur concerné est toujours celui du jeton (@CurrentUser) :
 * aucune route ne prend d'identifiant de patient, donc impossible de viser le profil d'un autre.
 */
@ApiTags('patients')
@ApiBearerAuth()
@Controller('me')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly account: AccountService,
  ) {}

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

  /**
   * Export de toutes mes données (L1-14), proposé en téléchargement (fichier JSON daté).
   * Données de santé : aucun cache ne doit garder la réponse.
   */
  @Get('export')
  @Roles('PATIENT')
  @Throttle(EXPORT_LIMIT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Exporter mes données : profil, mesures, événements (L1-14)' })
  @ApiOkResponse({ description: 'Export complet (DataExport)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Profil pas encore créé' })
  @ApiTooManyRequestsResponse({ description: 'Trop de demandes' })
  async exportData(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const data = await this.account.exportData(user.id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="afyabora-export-${data.exportedAt.slice(0, 10)}.json"`,
    );
    return data;
  }

  /** Suppression définitive du compte et de toutes ses données, mot de passe redemandé (L1-14). */
  @Delete()
  @Roles('PATIENT')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(DELETE_LIMIT)
  @ApiOperation({ summary: 'Supprimer mon compte et toutes mes données (L1-14)' })
  @ApiNoContentResponse({ description: 'Compte et données supprimés' })
  @ApiBadRequestResponse({ description: 'Mot de passe absent' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Mot de passe incorrect (INVALID_PASSWORD) ou rôle' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives' })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: { password: string },
  ): Promise<void> {
    await this.account.deleteAccount(user.id, body.password);
  }
}
