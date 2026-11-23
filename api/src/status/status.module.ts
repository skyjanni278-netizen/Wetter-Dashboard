import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ImportsModule } from '../imports/imports.module';
import { ObservationsModule } from '../observations/observations.module';
import { StatsModule } from '../stats/stats.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

/**
 * Lesemodell Datenstand (03 B4.1): `GET /api/status` aus `ObservationStore` (Datenbereich), `ImportStore`
 * (R25), `GapsService` (R26) und seit Schritt 12a dem `StatsModule` (`AggregationService` für `daysComplete`,
 * `RevisionCache`, US17-1). Die `SchedulerRegistry` (`nextScheduledUpdateAt`) stellt `ScheduleModule.forRoot()`
 * global bereit, aber nur bei `SCHEDULER_ENABLED=true`; der Service nimmt sie optional.
 */
@Module({
  imports: [CommonModule, ObservationsModule, ImportsModule, StatsModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
