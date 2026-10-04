import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';

@ApiTags('emergency')
@ApiBearerAuth()
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergency: EmergencyService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L6-05, L6-06) GET /emergency · PUT /emergency : carte du patient
  // TODO(L6-05, L6-06) POST /emergency/regenerate : nouveau QR (l'ancien devient inopérant)
  // TODO(L6-05, L6-06) GET /e/:token : page publique limitée (public, après confirmation « professionnel de santé / secouriste »)
}
