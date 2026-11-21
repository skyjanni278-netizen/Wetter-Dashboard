import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatusSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodResponse } from '../openapi/zod-openapi';
import type { Status } from './status';
import { StatusService } from './status.service';

/** US07-1/-2: Datenstand. */
@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(private readonly service: StatusService) {}

  @Get()
  @ApiOperation({ summary: 'Datenstand: erster/letzter Tag mit Daten, letzte Aktualisierung (US07)' })
  @ApiZodResponse(200, StatusSchema, 'Datenstand ohne Fehlertext')
  @ApiErrors()
  find(): Promise<Status> {
    return this.service.find();
  }
}
