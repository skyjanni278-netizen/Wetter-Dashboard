import { Module } from '@nestjs/common';
import { LegacyModule } from '../legacy/legacy.module';
import { FORECAST_STORE } from './forecast.store';
import { ForecastsController } from './forecasts.controller';
import { ForecastsService } from './forecasts.service';
import { InMemoryForecastStore } from './in-memory-forecast.store';

/**
 * Tagesvorhersage (03 B4.1): `GET /api/forecasts`. Exportiert den `ForecastStore` (Token `FORECAST_STORE`)
 * für das `ImportsModule`; kennt selbst keine Abläufe.
 */
@Module({
  imports: [LegacyModule],
  controllers: [ForecastsController],
  providers: [ForecastsService, { provide: FORECAST_STORE, useClass: InMemoryForecastStore }],
  exports: [FORECAST_STORE],
})
export class ForecastsModule {}
