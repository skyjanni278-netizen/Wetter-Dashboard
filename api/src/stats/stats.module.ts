import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DaysController } from '../days/days.controller';
import { DaysService } from '../days/days.service';
import { ObservationsModule } from '../observations/observations.module';

/**
 * Berechnete Ressourcen (03 B4.1): `days`, ab Schritt 7/8 auch `summaries` und `records`. Liest nur über
 * den exportierten `ObservationStore`. Die Dateien von `days` bleiben bis zum Umbau in Schritt 7 in
 * `src/days/`, die Schemas der Zusammenfassungen in `src/summaries/dto/`.
 */
@Module({
  imports: [CommonModule, ObservationsModule],
  controllers: [DaysController],
  providers: [DaysService],
})
export class StatsModule {}
