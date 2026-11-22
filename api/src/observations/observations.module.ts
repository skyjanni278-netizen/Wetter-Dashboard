import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { GapsController } from './gaps.controller';
import { GapsService } from './gaps.service';
import { Observation } from './observation.entity';
import { OBSERVATION_STORE } from './observation.store';
import { TypeOrmObservationStore } from './typeorm-observation.store';

/**
 * Stundenwerte (03 B4.1): Tabelle `observation` über den `TypeOrmObservationStore` (Token
 * `OBSERVATION_STORE`) und `GET /api/gaps`. Exportiert nur den Store. Kennt das `ImportsModule` **nicht**:
 * die `importId` eines Imports kommt nur als Wert herein (Spalte `import_id`), sonst entstünde der Zyklus
 * Imports ↔ Observations. Den Altbestand schreibt `cli import:legacy` über denselben Store (03 B2.7).
 */
@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([Observation])],
  controllers: [GapsController],
  providers: [GapsService, { provide: OBSERVATION_STORE, useClass: TypeOrmObservationStore }],
  exports: [OBSERVATION_STORE],
})
export class ObservationsModule {}
