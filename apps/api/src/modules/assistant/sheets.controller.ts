import { Controller, Get, Param } from '@nestjs/common';
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
import {
  knowledgeSheetIdSchema,
  type KnowledgeSheet,
  type KnowledgeSheetList,
} from '@glyka/shared';
import { invalidField, notFound } from '../../common/data/owned-records';
import { Roles } from '../../common/decorators/roles.decorator';
import { SheetsService } from './knowledge/sheets.service';

/**
 * Fiches de connaissances de l'assistant (L9-06, contrat 0.4.0) : rédigées à partir de sources publiques
 * et relues par un médecin. Réservées au patient, comme le reste de l'assistant.
 */
@ApiTags('assistant')
@ApiBearerAuth()
@Controller('assistant/sheets')
export class SheetsController {
  constructor(private readonly sheets: SheetsService) {}

  @Get()
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lister les fiches de l’assistant (L9-06)' })
  @ApiOkResponse({ description: 'Les fiches servies (relues ; brouillons hors production)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  list(): KnowledgeSheetList {
    return { items: this.sheets.list() };
  }

  @Get(':sheetId')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Lire une fiche (L9-06)' })
  @ApiOkResponse({ description: 'La fiche complète' })
  @ApiBadRequestResponse({ description: 'Identifiant de fiche invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Fiche inconnue (ou brouillon non servi)' })
  get(@Param('sheetId') sheetId: string): KnowledgeSheet {
    if (!knowledgeSheetIdSchema.safeParse(sheetId).success) {
      throw invalidField('sheetId', 'Identifiant de fiche invalide.');
    }
    const sheet = this.sheets.get(sheetId);
    if (!sheet) throw notFound('Fiche introuvable.');
    return sheet;
  }
}
