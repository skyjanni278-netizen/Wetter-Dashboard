import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyForecast } from './daily-forecast.entity';
import { FORECAST_STORE } from './forecast.store';
import { ForecastsController } from './forecasts.controller';
import { ForecastsService } from './forecasts.service';
import { TypeOrmForecastStore } from './typeorm-forecast.store';

/**
 * Tagesvorhersage (03 B4.1): `GET /api/forecasts`, Tabelle `daily_forecast` über den `TypeOrmForecastStore`.
 * Exportiert den `ForecastStore` (Token `FORECAST_STORE`) für das `ImportsModule`; kennt selbst keine Abläufe.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DailyForecast])],
  controllers: [ForecastsController],
  providers: [ForecastsService, { provide: FORECAST_STORE, useClass: TypeOrmForecastStore }],
  exports: [FORECAST_STORE],
})
export class ForecastsModule {}
