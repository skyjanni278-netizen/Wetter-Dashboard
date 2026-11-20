import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common/common.module';
import { ImportsModule } from '../imports/imports.module';
import { isSchedulerEnabled, SCHEDULER_ENABLED } from './scheduler-enabled';
import { SchedulerService } from './scheduler.service';

/**
 * Stündlicher Abruf (03 B4.1): importiert nur das `ImportsModule` (und die Uhr). Nur wenn der Schalter an
 * ist, kommt `ScheduleModule.forRoot()` dazu; sonst liest niemand das `@Cron`-Metadatum, es wird kein
 * Cron-Job registriert, und `tick()` tut nichts.
 */
@Module({})
export class SchedulerModule {
  static forRoot(enabled: boolean = isSchedulerEnabled()): DynamicModule {
    return {
      module: SchedulerModule,
      imports: [CommonModule, ImportsModule, ...(enabled ? [ScheduleModule.forRoot()] : [])],
      providers: [{ provide: SCHEDULER_ENABLED, useValue: enabled }, SchedulerService],
    };
  }
}
