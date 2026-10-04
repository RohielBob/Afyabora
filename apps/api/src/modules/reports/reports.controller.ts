import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L6-01, L6-02) GET /reports/consultation?period=14|30|90 : PDF (patient) ; version médecin via /doctor/sessions/:id/report
}
