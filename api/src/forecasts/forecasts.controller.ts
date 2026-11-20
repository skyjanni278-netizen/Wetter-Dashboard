import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ForecastsQuerySchema } from './dto/forecasts-query.schema';
import type { ForecastsQuery } from './dto/forecasts-query.schema';
import type { ForecastList } from './forecast';
import { ForecastsService } from './forecasts.service';

/** US03-1/-2: 7-Tage-Vorhersage; US03-3/R22: unbekannte Query-Parameter → 400. */
@Controller('forecasts')
export class ForecastsController {
  constructor(private readonly service: ForecastsService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(ForecastsQuerySchema)) _query: ForecastsQuery): Promise<ForecastList> {
    return this.service.findAll();
  }
}
