import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { syncPushEnvelopeSchema, type SyncPushEnvelope } from '@glyka/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SyncService } from './sync.service';

/**
 * Synchronisation hors-ligne (L8-04 ; pull : L8-05). Le contrôleur ne valide que l'ENVELOPPE du lot
 * (ADR-0004, modification 1) : chaque opération est validée ensuite séparément par SyncService, pour qu'une
 * opération invalide ne fasse pas échouer tout le lot. Le patient est toujours celui du jeton.
 */
@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @Roles('PATIENT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envoyer les opérations faites hors-ligne (200 au plus) (L8-04)' })
  @ApiOkResponse({ description: 'Un résultat par opération, dans le même ordre' })
  @ApiBadRequestResponse({ description: 'Enveloppe invalide (deviceId, plus de 200 opérations)' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({ description: 'Réservé aux patients' })
  push(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(syncPushEnvelopeSchema)) body: SyncPushEnvelope,
  ) {
    return this.sync.push(user.id, body);
  }
}
