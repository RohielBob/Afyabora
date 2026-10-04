import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L5-05) (service interne, pas de route publique ; le patient lit son journal via GET /shares/log)
}
