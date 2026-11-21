import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { ForecastsModule } from '../forecasts/forecasts.module';
import { ObservationsModule } from '../observations/observations.module';
import { WeatherProviderModule } from '../weather-provider/weather-provider.module';
import { ImportRunner } from './import-runner';
import { Import } from './import.entity';
import { IMPORT_STORE } from './import.store';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { TypeOrmImportStore } from './typeorm-import.store';

/**
 * Importe (03 B4.1): verbindet den Provider (`WeatherProviderModule`) mit dem Speichern
 * (`ObservationsModule`, `ForecastsModule`). Tabelle `import` über den `TypeOrmImportStore`; exportiert den
 * `ImportsService` für den Scheduler und den `ImportStore` (Token `IMPORT_STORE`) für das Lesemodell im
 * `StatusModule`. R19 prüft nur dieser Teil (Service plus partieller Unique-Index).
 */
@Module({
  imports: [CommonModule, ObservationsModule, ForecastsModule, WeatherProviderModule, TypeOrmModule.forFeature([Import])],
  controllers: [ImportsController],
  providers: [ImportsService, ImportRunner, { provide: IMPORT_STORE, useClass: TypeOrmImportStore }],
  exports: [ImportsService, IMPORT_STORE],
})
export class ImportsModule {}
