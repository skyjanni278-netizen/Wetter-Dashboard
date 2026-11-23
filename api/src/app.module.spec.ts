import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { Clock, SystemClock } from './common/clock';
import { DB_PATH } from './database/db-path';
import { DaysService } from './days/days.service';
import { FORECAST_STORE } from './forecasts/forecast.store';
import { ForecastsService } from './forecasts/forecasts.service';
import { HealthService } from './health/health.service';
import { IMPORT_STORE } from './imports/import.store';
import { ImportsService } from './imports/imports.service';
import { LocationsService } from './locations/locations.service';
import { NoticesService } from './notices/notices.service';
import { GapsService } from './observations/gaps.service';
import { OBSERVATION_STORE } from './observations/observation.store';
import { RecordsService } from './records/records.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { AggregationService } from './stats/aggregation.service';
import { StatusService } from './status/status.service';
import { SummariesService } from './summaries/summaries.service';
import { UsersService } from './users/users.service';
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
      NoticesService,
      GapsService,
      HealthService,
      AuthService,
      UsersService,
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
    // Tests laufen mit SCHEDULER_ENABLED=false (test-env.ts): kein ScheduleModule, kein Cron-Job.
    expect(() => moduleRef.get(SchedulerRegistry, { strict: false })).toThrow();
    expect(moduleRef.get(SchedulerService, { strict: false })).toBeInstanceOf(SchedulerService);

    await moduleRef.close();
  });

  it('ohne SCHEDULER_ENABLED gilt der Standard true (03 B4.8): ScheduleModule über ConditionalModule, Cron-Job registriert', async () => {
    const saved = { ...process.env };
    delete process.env['SCHEDULER_ENABLED'];
    try {
      // Eigenes Modul-Register: ConfigModule.forRoot und ConditionalModule werten beim Laden von app.module.ts aus.
      await jest.isolateModulesAsync(async () => {
        const { Test: IsolatedTest } = require('@nestjs/testing') as typeof import('@nestjs/testing');
        const { AppModule: IsolatedAppModule } = require('./app.module') as typeof import('./app.module');
        const schedule = require('@nestjs/schedule') as typeof import('@nestjs/schedule');
        const scheduler = require('./scheduler/scheduler.service') as typeof import('./scheduler/scheduler.service');
        const moduleRef = await IsolatedTest.createTestingModule({ imports: [IsolatedAppModule] }).compile();
        await moduleRef.init();
        try {
          const job = moduleRef.get(schedule.SchedulerRegistry, { strict: false }).getCronJob(scheduler.SCHEDULED_IMPORT_JOB);
          expect(job.cronTime.source).toBe('0 5 * * * *');
          expect(job.isActive).toBe(true);
        } finally {
          await moduleRef.close();
        }
      });
    } finally {
      process.env = saved;
    }
  });
});
