import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  GLUCOSE_UNITS,
  IMPORT_MAX_FILE_BYTES,
  importCommitSchema,
  importPreviewFormSchema,
} from '@glyka/shared';
import { invalidField, uuidParam } from '../../common/data/owned-records';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  ImportsService,
  type ImportCommitInput,
  type ImportPreviewForm,
  type UploadedImportFile,
} from './imports.service';
import { UploadErrorsInterceptor } from './upload-errors.interceptor';

/** Identifiant de lot dans l'URL : un UUID, sinon 400 au même format que les autres erreurs. */
const BATCH_ID = uuidParam();
/** Analyser un fichier coûte cher (jusqu'à 5 Mo, 5 000 lignes) : 10 aperçus par minute au plus. */
const PREVIEW_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Import CSV / Excel (L4-04). Le contrôleur ne contient aucune logique : il reçoit le fichier, valide les
 * champs avec les schémas de @glyka/shared puis délègue à ImportsService. Le patient est toujours celui du
 * jeton (@CurrentUser) : aucune route ne prend d'identifiant de patient.
 */
@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('preview')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.OK)
  @Throttle(PREVIEW_LIMIT)
  // Fichier gardé en mémoire (jamais écrit sur le disque), refusé dès qu'il dépasse 5 Mo (413). Les
  // refus de réception (en anglais) sont traduits par UploadErrorsInterceptor, placé avant.
  @UseInterceptors(
    UploadErrorsInterceptor,
    FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1, fields: 4 } }),
  )
  @ApiOperation({
    summary: 'Analyser un fichier CSV / Excel : rapport, rien n’est importé (L4-04)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'defaultUnit'],
      properties: {
        file: { type: 'string', format: 'binary' },
        defaultUnit: { type: 'string', enum: [...GLUCOSE_UNITS] },
        mapping: { type: 'string', description: 'Correspondance des colonnes, en JSON' },
      },
    },
  })
  @ApiOkResponse({ description: 'Rapport d’analyse (lot PREVIEW créé)' })
  @ApiBadRequestResponse({ description: 'Fichier manquant, illisible ou colonnes introuvables' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiPayloadTooLargeResponse({ description: 'Plus de 5 Mo ou plus de 5 000 lignes' })
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body(new ZodValidationPipe(importPreviewFormSchema)) form: ImportPreviewForm,
  ) {
    if (!file) throw invalidField('file', 'Choisissez un fichier .csv ou .xlsx.');
    return this.imports.preview(user.id, file, form);
  }

  @Post(':id/commit')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Importer le lot après les décisions du patient (L4-04)' })
  @ApiOkResponse({ description: 'Mesures créées (source IMPORT)' })
  @ApiBadRequestResponse({
    description: 'Décision impossible (ligne absente, rejetée, hors bornes)',
  })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Lot introuvable' })
  @ApiConflictResponse({ description: 'Lot déjà importé ou annulé, ou aperçu expiré' })
  commit(
    @CurrentUser() user: AuthUser,
    @Param('id', BATCH_ID) id: string,
    @Body(new ZodValidationPipe(importCommitSchema)) body: ImportCommitInput,
  ) {
    return this.imports.commit(user.id, id, body);
  }

  @Delete(':id')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Annuler un lot : toutes ses mesures sont supprimées (L4-04)' })
  @ApiOkResponse({ description: 'Nombre de mesures supprimées (0 si déjà annulé)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Lot introuvable' })
  revert(@CurrentUser() user: AuthUser, @Param('id', BATCH_ID) id: string) {
    return this.imports.revert(user.id, id);
  }
}
