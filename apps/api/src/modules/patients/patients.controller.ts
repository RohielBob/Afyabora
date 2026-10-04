import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('me')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L1-05, L1-14) GET /me/profile · PUT /me/profile
  // TODO(L1-05, L1-14) GET /me/export : export JSON/CSV de ses données (P1)
  // TODO(L1-05, L1-14) DELETE /me : suppression du compte et des données (P1)
}
