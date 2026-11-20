import { Injectable } from '@nestjs/common';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import type { ForecastStore, StoredForecast } from './forecast.store';

/**
 * `ForecastStore` im Arbeitsspeicher (Schritt 3, bis Schritt 9).
 *
 * - `forecast.json` liest `LegacyFileSource` bei jeder Anfrage neu (Express überschreibt sie stündlich).
 * - Eine von Nest importierte Vorhersage liegt nur im Arbeitsspeicher. Geliefert wird die jüngere
 *   von beiden (Vergleich der Abrufzeitpunkte; beim Altbestand ist das die Änderungszeit der Datei).
 * - Schreibt **nie** in Dateien.
 */
@Injectable()
export class InMemoryForecastStore implements ForecastStore {
  private imported: StoredForecast | null = null;

  constructor(private readonly legacy: LegacyFileSource) {}

  async getLatest(): Promise<StoredForecast | null> {
    const file = await this.legacy.getForecast();
    const legacy: StoredForecast | null = file ? { days: file.days, fetchedAt: file.fetchedAt, importId: null } : null;
    if (!this.imported) return legacy;
    if (!legacy) return copy(this.imported);
    return Date.parse(this.imported.fetchedAt) >= Date.parse(legacy.fetchedAt) ? copy(this.imported) : legacy;
  }

  async save(forecast: StoredForecast): Promise<void> {
    this.imported = copy(forecast);
  }
}

function copy(forecast: StoredForecast): StoredForecast {
  return { ...forecast, days: forecast.days.map(day => ({ ...day })) };
}
