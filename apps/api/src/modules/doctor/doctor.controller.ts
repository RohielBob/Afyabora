import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DoctorService } from './doctor.service';

@ApiTags('doctor')
@ApiBearerAuth()
@Controller('doctor')
export class DoctorController {
  constructor(private readonly doctor: DoctorService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L5-03, L5-11, L5-12) GET /doctor/sessions : sessions de partage du médecin (actives et expirées)
  // TODO(L5-03, L5-11, L5-12) GET /doctor/sessions/:id/summary · /measurements · /timeline · /report
}
