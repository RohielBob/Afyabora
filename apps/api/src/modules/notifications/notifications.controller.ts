import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L8-14, L8-16) POST /devices : enregistre le jeton push de l'appareil
  // TODO(L8-14, L8-16) GET/PUT /notifications/preferences
  // TODO(L8-14, L8-16) (interne) NotificationsService.enqueue(userId, category, payload)
}
