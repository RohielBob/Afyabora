import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Routes à implémenter (voir README.md du module) :
  // TODO(L2-02, L2-10) GET /events?from&to · POST /events · PUT /events/:id · DELETE /events/:id
}
