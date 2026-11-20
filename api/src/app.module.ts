import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { Clock, SystemClock } from './common/clock';
import { DaysController } from './days/days.controller';
import { DaysService } from './days/days.service';
import { FORECAST_STORE } from './forecasts/forecast.store';
import { ForecastsController } from './forecasts/forecasts.controller';
import { ForecastsService } from './forecasts/forecasts.service';
import { InMemoryForecastStore } from './forecasts/in-memory-forecast.store';
import { ImportRunner } from './imports/import-runner';
import { IMPORT_STORE } from './imports/import.store';
import { ImportsController } from './imports/imports.controller';
import { ImportsService } from './imports/imports.service';
import { InMemoryImportStore } from './imports/in-memory-import.store';
import { LEGACY_DATA_DIR, resolveLegacyDataDir } from './legacy/legacy-data-dir';
import { LegacyFileSource } from './legacy/legacy-file-source';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { InMemoryObservationStore } from './observations/in-memory-observation.store';
import { OBSERVATION_STORE } from './observations/observation.store';
import { StatusController } from './status/status.controller';
import { StatusService } from './status/status.service';
import { OpenMeteoClient } from './weather-provider/open-meteo.client';

/**
 * Schritt 3: ein Modul; Controller rufen Services, Services nutzen die Stores über DI-Tokens.
 * Die Stores liegen im Arbeitsspeicher (Schritt 9: TypeORM). Module je Ressource folgen in Schritt 6,
 * `ConfigModule` ersetzt `process.env` in Schritt 11. Schritt 5: der globale `ApiExceptionFilter`
 * (Fehlerformat B3.3); Middleware und Body-Parser richtet `configureApp` ein (`app.setup.ts`).
 */
@Module({
  controllers: [LocationsController, DaysController, ForecastsController, StatusController, ImportsController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: Clock, useClass: SystemClock },
    { provide: LEGACY_DATA_DIR, useFactory: () => resolveLegacyDataDir() },
    LegacyFileSource,
    { provide: OBSERVATION_STORE, useClass: InMemoryObservationStore },
    { provide: FORECAST_STORE, useClass: InMemoryForecastStore },
    { provide: IMPORT_STORE, useClass: InMemoryImportStore },
    OpenMeteoClient,
    LocationsService,
    DaysService,
    ForecastsService,
    StatusService,
    ImportsService,
    ImportRunner,
  ],
})
export class AppModule {}
