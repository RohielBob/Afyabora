import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  type ApiQueryOptions,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { insightsQuerySchema, PERIOD_DAYS } from '@glyka/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InsightsService } from './insights.service';

type InsightsQuery = z.infer<typeof insightsQuerySchema>;

const PERIOD_QUERY: ApiQueryOptions = {
  name: 'period',
  required: false,
  enum: [...PERIOD_DAYS],
  description: 'Période en jours (30 par défaut)',
};

/**
 * Analyse des mesures du patient (L3-03). Le contrôleur ne contient aucune logique : il valide la période
 * avec le schéma de @glyka/shared puis délègue à InsightsService. Le patient est toujours celui du jeton
 * (@CurrentUser) : aucune route ne prend d'identifiant de patient.
 * Routes à la racine (/insights et /quality), comme dans le contrat.
 */
@ApiTags('insights')
@ApiBearerAuth()
@Controller()
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Statistiques et observations de la période (L3-03)' })
  @ApiQuery(PERIOD_QUERY)
  @ApiOkResponse({
    description: 'Analyse de la période. Sous 10 mesures : `stats` est nul et `insights` est vide.',
  })
  @ApiBadRequestResponse({ description: 'Période invalide (7, 14, 30 ou 90 jours)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  getInsights(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(insightsQuerySchema)) query: InsightsQuery,
  ) {
    return this.insights.insights(user.id, query.period);
  }

  @Get('quality')
  @Roles('PATIENT')
  @ApiOperation({ summary: 'Score de qualité des données de la période (L3-03)' })
  @ApiQuery(PERIOD_QUERY)
  @ApiOkResponse({ description: 'Score de qualité (couverture, densité, fraîcheur)' })
  @ApiBadRequestResponse({ description: 'Période invalide (7, 14, 30 ou 90 jours)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  getQuality(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(insightsQuerySchema)) query: InsightsQuery,
  ) {
    return this.insights.quality(user.id, query.period);
  }

  // TODO(L3-08) POST /insights/ask : question libre sur son historique (P1).
}
