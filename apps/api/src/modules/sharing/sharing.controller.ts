import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SharingService } from './sharing.service';

@ApiTags('sharing')
@ApiBearerAuth()
@Controller('shares')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) POST /shares : crée une session (catégories + durée) et renvoie le premier jeton
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) GET /shares/:id/token : nouveau jeton (rotation toutes les 60 s) tant que la session est `PENDING`
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) GET /shares/:id/status : état (PENDING / ACTIVE / EXPIRED / REVOKED) pour l'app patient (polling ou SSE)
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) DELETE /shares/:id : révocation immédiate
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) POST /shares/claim : le médecin consomme le jeton (médecin approuvé uniquement)
  // TODO(L5-01, L5-02, L5-04, L5-05, L5-14) GET /shares/log : journal d'accès du patient
}
