import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "État de l'API et de la base de données (public, sans donnée sensible)",
  })
  @ApiOkResponse({ description: 'API et base de données opérationnelles : { status: "ok", time }' })
  @ApiServiceUnavailableResponse({
    description: 'Base de données injoignable : { status: "error", message }',
  })
  check() {
    return this.health.check();
  }
}
