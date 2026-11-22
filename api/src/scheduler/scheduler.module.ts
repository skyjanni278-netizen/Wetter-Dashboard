import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';
import { ConditionalModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common/common.module';
import type { AppConfig } from '../config/config';
import { ImportsModule } from '../imports/imports.module';
import { SCHEDULER_ENABLED } from './scheduler-enabled';
import { SchedulerService } from './scheduler.service';

/**
 * Stündlicher Abruf (03 B4.1): importiert nur das `ImportsModule` (und die Uhr). Nur wenn der Schalter an
 * ist, kommt `ScheduleModule.forRoot()` dazu; sonst liest niemand das `@Cron`-Metadatum, es wird kein
 * Cron-Job registriert, und `tick()` tut nichts.
 *
 * Ohne Argument (App) gilt `SCHEDULER_ENABLED` aus der Konfiguration (03 B4.8, Standard `true`): das Token aus
 * dem `ConfigService`, `ScheduleModule` über `ConditionalModule` von `@nestjs/config` (prüft erst, wenn das
 * `ConfigModule` geladen und geprüft ist; der Wert steht dann als `"true"`/`"false"` in der Umgebung). Mit
 * Argument (Tests) fest an bzw. aus.
 */
@Module({})
export class SchedulerModule {
  static forRoot(enabled?: boolean): DynamicModule {
    const fromConfig = enabled === undefined;
    const schedule = fromConfig
      ? [ConditionalModule.registerWhen(ScheduleModule.forRoot(), env => env['SCHEDULER_ENABLED'] === 'true', { debug: false })]
      : enabled
        ? [ScheduleModule.forRoot()]
        : [];
    const enabledProvider: Provider = fromConfig
      ? {
          provide: SCHEDULER_ENABLED,
          inject: [ConfigService],
          useFactory: (config: AppConfig) => config.get('SCHEDULER_ENABLED', { infer: true }),
        }
      : { provide: SCHEDULER_ENABLED, useValue: enabled };
    return {
      module: SchedulerModule,
      imports: [CommonModule, ImportsModule, ...schedule],
      providers: [enabledProvider, SchedulerService],
    };
  }
}
