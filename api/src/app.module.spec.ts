import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { Clock, SystemClock } from './common/clock';
import { DB_PATH } from './database/db-path';
import { DaysService } from './days/days.service';
import { FORECAST_STORE } from './forecasts/forecast.store';
import { ForecastsService } from './forecasts/forecasts.service';
import { HealthService } from './health/health.service';
import { IMPORT_STORE } from './imports/import.store';
import { ImportsService } from './imports/imports.service';
import { LocationsService } from './locations/locations.service';
import { GapsService } from './observations/gaps.service';
import { OBSERVATION_STORE } from './observations/observation.store';
import { RecordsService } from './records/records.service';
import { isSchedulerEnabled } from './scheduler/scheduler-enabled';
import { SchedulerService } from './scheduler/scheduler.service';
import { AggregationService } from './stats/aggregation.service';
import { StatusService } from './status/status.service';
import { SummariesService } from './summaries/summaries.service';
import { OpenMeteoClient } from './weather-provider/open-meteo.client';

/**
 * Boot-Test (Schritt 6): `AppModule` kompiliert ohne Zyklus und ohne `forwardRef`. Nest bricht beim
 * Kompilieren ab, wenn ein Modul einen Provider nutzt, den das importierte Modul nicht exportiert.
 */
describe('AppModule (Boot, Module nach B4.1)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('kompiliert und startet; alle Services und Stores sind erreichbar', async () => {
    // Datenbank `:memory:` (test/support/test-env.ts), Schema über die Migrationen beim Verbinden.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();

    for (const token of [
      LocationsService,
      DaysService,
      SummariesService,
      RecordsService,
      AggregationService,
      ForecastsService,
      ImportsService,
      StatusService,
      GapsService,
      HealthService,
      SchedulerService,
      OpenMeteoClient,
      OBSERVATION_STORE,
      FORECAST_STORE,
      IMPORT_STORE,
    ]) {
      expect(moduleRef.get(token, { strict: false })).toBeDefined();
    }
    expect(moduleRef.get(Clock, { strict: false })).toBeInstanceOf(SystemClock);
    expect(moduleRef.get(DB_PATH, { strict: false })).toBe(':memory:');
    // Standard SCHEDULER_ENABLED=false: kein ScheduleModule, kein Cron-Job.
    // Ist der Schalter in der Shell gesetzt, gibt es die Registry (Wert wird beim Laden gelesen).
    if (isSchedulerEnabled()) {
      expect(moduleRef.get(SchedulerRegistry, { strict: false })).toBeDefined();
    } else {
      expect(() => moduleRef.get(SchedulerRegistry, { strict: false })).toThrow();
    }

    await moduleRef.close();
  });
});
