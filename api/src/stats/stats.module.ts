import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DaysController } from '../days/days.controller';
import { DaysService } from '../days/days.service';
import { ObservationsModule } from '../observations/observations.module';
import { RecordsController } from '../records/records.controller';
import { RecordsService } from '../records/records.service';
import { SummariesController } from '../summaries/summaries.controller';
import { SummariesService } from '../summaries/summaries.service';
import { AggregationService } from './aggregation.service';

/**
 * Berechnete Ressourcen (03 B4.1): `days`, `summaries` und `records`. Liest nur über den exportierten
 * `ObservationStore`; alle Fachregeln (R06–R14) liegen im `AggregationService`. Die Dateien der
 * Ressourcen liegen in `src/days/`, `src/summaries/` und `src/records/`, das Modul und die Regeln in `src/stats/`.
 */
@Module({
  imports: [CommonModule, ObservationsModule],
  controllers: [DaysController, SummariesController, RecordsController],
  providers: [AggregationService, DaysService, SummariesService, RecordsService],
})
export class StatsModule {}
