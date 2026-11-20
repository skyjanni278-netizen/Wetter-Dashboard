import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { LEGACY_DATA_DIR, resolveLegacyDataDir } from './legacy-data-dir';
import { LegacyFileSource } from './legacy-file-source';

/**
 * Übergang bis Schritt 9: liest die JSON-Dateien von Express (nur lesend). Nur die In-Memory-Stores von
 * `ObservationsModule` und `ForecastsModule` importieren dieses Modul; es kennt keine Fachmodule.
 * Mit der Datenbank (Schritt 9) entfällt es, der Altbestand kommt dann über den Legacy-Import.
 */
@Module({
  imports: [CommonModule],
  providers: [{ provide: LEGACY_DATA_DIR, useFactory: () => resolveLegacyDataDir() }, LegacyFileSource],
  exports: [LegacyFileSource],
})
export class LegacyModule {}
