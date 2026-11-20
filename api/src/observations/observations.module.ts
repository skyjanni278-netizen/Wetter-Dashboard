import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { LegacyModule } from '../legacy/legacy.module';
import { InMemoryObservationStore } from './in-memory-observation.store';
import { OBSERVATION_STORE } from './observation.store';

/**
 * Stundenwerte (03 B4.1). Exportiert nur den `ObservationStore` (Token `OBSERVATION_STORE`).
 * Kennt das `ImportsModule` **nicht**: die `importId` eines Imports kommt nur als Wert herein
 * (Schritt 9: Spalte `import_id`), sonst entstünde der Zyklus Imports ↔ Observations.
 */
@Module({
  imports: [CommonModule, LegacyModule],
  providers: [{ provide: OBSERVATION_STORE, useClass: InMemoryObservationStore }],
  exports: [OBSERVATION_STORE],
})
export class ObservationsModule {}
