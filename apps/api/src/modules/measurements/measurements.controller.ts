import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MeasurementsService } from './measurements.service';

@ApiTags('measurements')
@ApiBearerAuth()
@Controller('measurements')
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L2-01, L2-12) GET /measurements?from&to · POST /measurements · PUT /measurements/:id · DELETE /measurements/:id
}
