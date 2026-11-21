import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecordsSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { RecordsQuerySchema } from './dto/records-query.schema';
import type { RecordsQuery } from './dto/records-query.schema';
import type { Records } from './record';
import { RecordsService } from './records.service';

/** US06: Rekorde. Der Controller kennt nur HTTP, die Regeln liegen im `AggregationService`. */
@ApiTags('records')
@Controller('records')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Rekorde ohne Vorhersagestunden (US06)' })
  @ApiZodQuery(RecordsQuerySchema)
  @ApiZodResponse(200, RecordsSchema, 'Rekorde; ohne Daten alle `null`, `daysCounted = 0`')
  @ApiErrors({ 400: 'VALIDATION_FAILED: `unrecognized_keys` (kein Query-Parameter erlaubt, R22)' })
  find(@Query(new ZodValidationPipe(RecordsQuerySchema)) _query: RecordsQuery): Promise<Records> {
    return this.service.find();
  }
}
