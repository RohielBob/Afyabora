import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Aucune route publique (L5-05) : AuditService est un service interne ; le patient lit son journal par
  // GET /shares/log (module `sharing`). Personne ne peut modifier ni supprimer une ligne du journal.
}
