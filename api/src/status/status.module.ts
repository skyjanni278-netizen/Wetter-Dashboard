import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ImportsModule } from '../imports/imports.module';
import { ObservationsModule } from '../observations/observations.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

/**
 * Lesemodell Datenstand (03 B4.1): `GET /api/status` aus `ObservationStore` (Datenbereich) und
 * `ImportStore` (R25). Das `StatsModule` kommt mit `daysComplete` (US17-1) dazu.
 */
@Module({
  imports: [CommonModule, ObservationsModule, ImportsModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
