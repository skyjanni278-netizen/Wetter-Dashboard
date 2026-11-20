import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ForecastsModule } from '../forecasts/forecasts.module';
import { ObservationsModule } from '../observations/observations.module';
import { WeatherProviderModule } from '../weather-provider/weather-provider.module';
import { ImportRunner } from './import-runner';
import { IMPORT_STORE } from './import.store';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { InMemoryImportStore } from './in-memory-import.store';

/**
 * Importe (03 B4.1): verbindet den Provider (`WeatherProviderModule`) mit dem Speichern
 * (`ObservationsModule`, `ForecastsModule`). Exportiert den `ImportsService` für den Scheduler und den
 * `ImportStore` (Token `IMPORT_STORE`) für das Lesemodell im `StatusModule`. R19 prüft nur dieser Teil.
 */
@Module({
  imports: [CommonModule, ObservationsModule, ForecastsModule, WeatherProviderModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportRunner, { provide: IMPORT_STORE, useClass: InMemoryImportStore }],
  exports: [ImportsService, IMPORT_STORE],
})
export class ImportsModule {}
