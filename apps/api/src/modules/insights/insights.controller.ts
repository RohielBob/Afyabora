import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L3-03 à L3-07, L3-10) GET /insights?period : statistiques + observations
  // TODO(L3-03 à L3-07, L3-10) GET /quality?period : score de qualité
  // TODO(L3-03 à L3-07, L3-10) POST /insights/ask : question libre sur son historique (P1)
}
