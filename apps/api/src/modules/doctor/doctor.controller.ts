import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DoctorService } from './doctor.service';

/**
 * Portail médecin (lot L5). Le contrôleur ne contient aucune logique : il délègue à DoctorService. Le
 * médecin est toujours celui du jeton (@CurrentUser).
 */
@ApiTags('doctor')
@ApiBearerAuth()
@Controller('doctor')
export class DoctorController {
  constructor(private readonly doctor: DoctorService) {}

  @Get('sessions')
  @Roles('DOCTOR')
  @ApiOperation({ summary: 'Mes patients partagés (L5-11)' })
  @ApiOkResponse({ description: 'Sessions du médecin : en cours d’abord, puis les plus récentes' })
  @ApiUnauthorizedResponse({ description: 'Jeton absent ou invalide' })
  @ApiForbiddenResponse({
    description: 'Réservé aux médecins approuvés (code DOCTOR_NOT_APPROVED)',
  })
  sessions(@CurrentUser() user: AuthUser) {
    return this.doctor.listSessions(user.id);
  }

  // Routes suivantes du module (voir README.md) :
  // TODO(L5-12) GET /doctor/sessions/:id/summary · /measurements · /timeline · /report
}
