import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { CommonModule } from './common/common.module';
import { ForecastsModule } from './forecasts/forecasts.module';
import { ImportsModule } from './imports/imports.module';
import { LocationsModule } from './locations/locations.module';
import { ObservationsModule } from './observations/observations.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { StatsModule } from './stats/stats.module';
import { StatusModule } from './status/status.module';
import { WeatherProviderModule } from './weather-provider/weather-provider.module';

/**
 * Schritt 6: Module je Ressource nach 03 B4.1, ohne Zyklen und ohne `forwardRef`. Jedes Modul nutzt von
 * anderen nur, was diese über `exports` freigeben. `AppModule` bündelt die Module und registriert den
 * globalen `ApiExceptionFilter` (Fehlerformat B3.3); Middleware und Body-Parser richtet `configureApp`
 * ein (`app.setup.ts`). `SCHEDULER_ENABLED` liest `SchedulerModule.forRoot()` beim Laden dieser Datei.
 */
@Module({
  imports: [
    CommonModule,
    LocationsModule,
    ObservationsModule,
    ForecastsModule,
    WeatherProviderModule,
    ImportsModule,
    SchedulerModule.forRoot(),
    StatsModule,
    StatusModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
