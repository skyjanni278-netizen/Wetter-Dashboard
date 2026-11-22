import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { HealthSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodResponse } from '../openapi/zod-openapi';
import type { Health } from './health';
import { HealthService } from './health.service';

/** US14-3: Betriebsprüfung (systemd, Monitoring); bleibt später ohne Anmeldung erreichbar. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Betriebsprüfung: API und Datenbank erreichbar (US14-3)' })
  @ApiZodResponse(200, HealthSchema, 'API läuft, Datenbank lesbar')
  @ApiErrors({ 503: 'SERVICE_UNAVAILABLE: Datenbank nicht lesbar (`details.database = "error"`)' })
  check(): Promise<Health> {
    return this.service.check();
  }
}
