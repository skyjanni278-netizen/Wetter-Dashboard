import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { StatusSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodResponse } from '../openapi/zod-openapi';
import type { Status } from './status';
import { StatusService } from './status.service';

/** US07-1/-2, US16-1 bis -3, US17-1/-2: Datenstand und Vollständigkeit (öffentlich, ohne Fehlertext). */
@ApiTags('status')
@Public()
@Controller('status')
export class StatusController {
  constructor(private readonly service: StatusService) {}

  @Get()
  @ApiOperation({
    summary: 'Datenstand: Datenzeitraum, letzte und nächste Aktualisierung, Tage mit Daten, vollständige Tage, Lücken (US07, US16, US17)',
  })
  @ApiZodResponse(200, StatusSchema, 'Datenstand ohne Fehlertext')
  @ApiErrors()
  find(): Promise<Status> {
    return this.service.find();
  }
}
