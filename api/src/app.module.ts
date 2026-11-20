import { Module } from '@nestjs/common';
import { Clock, SystemClock } from './common/clock';
import { DaysController } from './days/days.controller';
import { ForecastsController } from './forecasts/forecasts.controller';
import { LEGACY_DATA_DIR, resolveLegacyDataDir } from './legacy/legacy-data-dir';
import { LegacyFileSource } from './legacy/legacy-file-source';
import { LocationsController } from './locations/locations.controller';
import { StatusController } from './status/status.controller';

/**
 * Schritt 2: ein Modul, Controller ohne Services. Module je Ressource folgen in Schritt 6,
 * `ConfigModule` ersetzt `process.env` in Schritt 11.
 */
@Module({
  controllers: [LocationsController, DaysController, ForecastsController, StatusController],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: LEGACY_DATA_DIR, useFactory: () => resolveLegacyDataDir() },
    LegacyFileSource,
  ],
})
export class AppModule {}
