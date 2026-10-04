import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ImportsService } from './imports.service';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L4-01 à L4-04, L4-08) POST /imports/preview : analyse le fichier, crée un lot `PREVIEW`, renvoie le rapport
  // TODO(L4-01 à L4-04, L4-08) POST /imports/:id/commit : applique les décisions (Corriger / Ignorer / Accepter)
  // TODO(L4-01 à L4-04, L4-08) DELETE /imports/:id : annule un lot déjà importé
}
