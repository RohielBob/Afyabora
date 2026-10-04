import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L8-04, L8-05, L8-09) POST /sync/push : lot d'opérations (≤ 200) avec résultat par opération
  // TODO(L8-04, L8-05, L8-09) GET /sync/pull?cursor&limit : changements depuis le curseur (inclut les tombstones)
}
