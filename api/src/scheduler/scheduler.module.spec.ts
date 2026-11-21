import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../database/database.module';
import { SchedulerModule } from './scheduler.module';
import { SCHEDULED_IMPORT_JOB, SchedulerService } from './scheduler.service';

async function boot(enabled: boolean): Promise<TestingModule> {
  // Die Stores brauchen die Datenbank (`:memory:`, test/support/test-env.ts).
  const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, SchedulerModule.forRoot(enabled)] }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('SchedulerModule.forRoot (SCHEDULER_ENABLED)', () => {
  let moduleRef: TestingModule | undefined;

  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
    jest.restoreAllMocks();
  });

  it('false: kein ScheduleModule, also kein Cron-Job registriert', async () => {
    moduleRef = await boot(false);

    expect(moduleRef.get(SchedulerService)).toBeInstanceOf(SchedulerService);
    expect(() => moduleRef?.get(SchedulerRegistry, { strict: false })).toThrow();
  });

  it('true: Cron-Job "0 5 * * * *" in Europe/Berlin ist registriert und läuft', async () => {
    moduleRef = await boot(true);

    const job = moduleRef.get(SchedulerRegistry).getCronJob(SCHEDULED_IMPORT_JOB);
    expect(job.cronTime.source).toBe('0 5 * * * *');
    expect(job.cronTime.timeZone).toBe('Europe/Berlin');
    expect(job.isActive).toBe(true);
    // 20.11.2026 10:10 MEZ → nächster Lauf 11:05 MEZ = 10:05 UTC
    const next = job.cronTime.getNextDateFrom(new Date('2026-11-20T09:10:00Z'));
    expect(next.toUTC().toISO({ suppressMilliseconds: true })).toBe('2026-11-20T10:05:00Z');
  });

  it('true: close() stoppt den Cron-Job', async () => {
    moduleRef = await boot(true);
    const job = moduleRef.get(SchedulerRegistry).getCronJob(SCHEDULED_IMPORT_JOB);

    await moduleRef.close();
    moduleRef = undefined;

    expect(job.isActive).toBe(false);
  });
});
