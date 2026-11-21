import { Inject, Injectable, Optional } from '@nestjs/common';
import { ACTIVE_FIXTURE } from '../fixtures/fixture';
import type { Fixture } from '../fixtures/fixture';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import type { ForecastStore, StoredForecast } from './forecast.store';

/**
 * `ForecastStore` im Arbeitsspeicher (Schritt 3). Seit Schritt 9 nur Unit-Tests und Testpfad (`useLegacyStores`).
 *
 * - `forecast.json` liest `LegacyFileSource` bei jeder Anfrage neu (Express überschreibt sie stündlich).
 * - Mit einer Fixture tritt die Vorhersage der Fixture an die Stelle von `forecast.json`.
 * - Eine von Nest importierte Vorhersage liegt nur im Arbeitsspeicher. Geliefert wird die jüngere
 *   von beiden (Vergleich der Abrufzeitpunkte; beim Altbestand ist das die Änderungszeit der Datei).
 * - Schreibt **nie** in Dateien.
 */
@Injectable()
export class InMemoryForecastStore implements ForecastStore {
  private imported: StoredForecast | null = null;
  private readonly fixture: Fixture | null;

  constructor(
    private readonly legacy: LegacyFileSource,
    @Optional() @Inject(ACTIVE_FIXTURE) fixture: Fixture | null = null,
  ) {
    this.fixture = fixture;
  }

  async getLatest(): Promise<StoredForecast | null> {
    const base = await this.base();
    if (!this.imported) return base;
    if (!base) return copy(this.imported);
    return Date.parse(this.imported.fetchedAt) >= Date.parse(base.fetchedAt) ? copy(this.imported) : base;
  }

  async save(forecast: StoredForecast): Promise<void> {
    this.imported = copy(forecast);
  }

  /** Vorhersage aus der Fixture oder aus `forecast.json`. */
  private async base(): Promise<StoredForecast | null> {
    if (this.fixture) {
      const forecast = this.fixture.forecast;
      return forecast ? copy({ days: forecast.days, fetchedAt: forecast.fetchedAt, importId: null }) : null;
    }
    const file = await this.legacy.getForecast();
    return file ? { days: file.days, fetchedAt: file.fetchedAt, importId: null } : null;
  }
}

function copy(forecast: StoredForecast): StoredForecast {
  return { ...forecast, days: forecast.days.map(day => ({ ...day })) };
}
