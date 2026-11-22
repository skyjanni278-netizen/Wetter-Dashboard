import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ForecastListSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { ForecastsQuerySchema } from './dto/forecasts-query.schema';
import type { ForecastsQuery } from './dto/forecasts-query.schema';
import type { ForecastList } from './forecast';
import { ForecastsService } from './forecasts.service';

/** US03-1/-2: 7-Tage-Vorhersage; US03-3/R22: unbekannte Query-Parameter → 400. */
@ApiTags('forecasts')
@Public()
@Controller('forecasts')
export class ForecastsController {
  constructor(private readonly service: ForecastsService) {}

  @Get()
  @ApiOperation({ summary: '7-Tage-Vorhersage (US03)' })
  @ApiZodQuery(ForecastsQuerySchema)
  @ApiZodResponse(200, ForecastListSchema, 'Vorhersagetage; ohne Vorhersage `items = []`, `fetchedAt = null`')
  @ApiErrors({ 400: 'VALIDATION_FAILED: `unrecognized_keys` (kein Query-Parameter erlaubt, R22)' })
  findAll(@Query(new ZodValidationPipe(ForecastsQuerySchema)) _query: ForecastsQuery): Promise<ForecastList> {
    return this.service.findAll();
  }
}
