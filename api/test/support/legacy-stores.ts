import type { TestingModuleBuilder } from '@nestjs/testing';
import type { Clock } from '../../src/common/clock';
import type { Fixture } from '../../src/fixtures/fixture';
import { FORECAST_STORE } from '../../src/forecasts/forecast.store';
import { InMemoryForecastStore } from '../../src/forecasts/in-memory-forecast.store';
import { IMPORT_STORE } from '../../src/imports/import.store';
import { InMemoryImportStore } from '../../src/imports/in-memory-import.store';
import { LegacyFileSource } from '../../src/legacy/legacy-file-source';
import { InMemoryObservationStore } from '../../src/observations/in-memory-observation.store';
import { OBSERVATION_STORE } from '../../src/observations/observation.store';

export interface LegacyStoresOptions {
  /** Dieselbe Uhr wie `overrideProvider(Clock)` im Test. */
  clock: Clock;
  /** Ordner mit Tagesdateien im Altformat (nur lesend); bei einer Fixture ein leerer Ordner. */
  dataDir: string;
  /** Fixture als Grundlage statt der Dateien (wie bisher `ACTIVE_FIXTURE`). */
  fixture?: Fixture | null;
}

/**
 * Testpfad bis Schritt 9b: ersetzt die drei TypeORM-Stores durch die In-Memory-Stores, die wie vor Schritt 9
 * die Altdateien (`LegacyFileSource`) bzw. eine Fixture lesen. Damit prüfen die bisherigen e2e-Tests weiter
 * dieselben Fälle, ohne die Datenbank. Die App selbst kennt diesen Weg nicht mehr (die DB ist die Quelle).
 *
 * TODO(9b): Nach dem Altdatenimport (`cli import:legacy`) die Tests auf die Datenbank umstellen und diese
 * Hilfe samt `LegacyFileSource` entfernen.
 */
export function useLegacyStores(builder: TestingModuleBuilder, options: LegacyStoresOptions): TestingModuleBuilder {
  const fixture = options.fixture ?? null;
  let source: Promise<LegacyFileSource> | undefined;
  // Eine Quelle für beide Stores; geladen wird einmal, wie früher in `onModuleInit`.
  const loadSource = (): Promise<LegacyFileSource> =>
    (source ??= (async () => {
      const legacy = new LegacyFileSource(options.dataDir, options.clock);
      await legacy.onModuleInit();
      return legacy;
    })());

  return builder
    .overrideProvider(OBSERVATION_STORE)
    .useFactory({ factory: async () => new InMemoryObservationStore(await loadSource(), options.clock, fixture) })
    .overrideProvider(FORECAST_STORE)
    .useFactory({ factory: async () => new InMemoryForecastStore(await loadSource(), fixture) })
    .overrideProvider(IMPORT_STORE)
    .useFactory({ factory: () => new InMemoryImportStore(fixture) });
}
