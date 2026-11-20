import { Controller, Get } from '@nestjs/common';
import type { ForecastList } from './forecast';
import { ForecastsService } from './forecasts.service';

/** US03-1/-2: 7-Tage-Vorhersage. */
@Controller('forecasts')
export class ForecastsController {
  constructor(private readonly service: ForecastsService) {}

  @Get()
  findAll(): Promise<ForecastList> {
    return this.service.findAll();
  }
}
