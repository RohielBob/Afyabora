import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { reportQuerySchema } from '@glyka/shared';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { ReportDays } from './report-data';
import { ReportsService, type ConsultationReport } from './reports.service';

/** Générer un PDF coûte du calcul : 10 rapports par minute au plus (largement assez pour un humain). */
export const REPORT_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/** Envoie le PDF : téléchargement, jamais gardé dans un cache (données de santé). */
export function sendPdf(res: Response, report: ConsultationReport): StreamableFile {
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  return new StreamableFile(report.pdf, { type: 'application/pdf', length: report.pdf.length });
}

/**
 * Rapport « Préparer ma consultation » (L6-02, CDC F9). Le contrôleur ne contient aucune logique : il délègue
 * à ReportsService. Le patient est toujours celui du jeton. La version médecin est dans le module `doctor`.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('consultation')
  @Roles('PATIENT')
  @Throttle(REPORT_LIMIT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Mon rapport « Préparer ma consultation » en PDF (L6-02)' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Rapport PDF (14, 30 ou 90 derniers jours)' })
  @ApiBadRequestResponse({ description: 'Période invalide (14, 30 ou 90)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  @ApiNotFoundResponse({ description: 'Profil pas encore créé' })
  @ApiTooManyRequestsResponse({ description: 'Trop de rapports demandés en une minute' })
  async consultation(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: { period: number },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const report = await this.reports.consultation(user.id, query.period as ReportDays, {
      kind: 'PATIENT',
    });
    return sendPdf(res, report);
  }
}
