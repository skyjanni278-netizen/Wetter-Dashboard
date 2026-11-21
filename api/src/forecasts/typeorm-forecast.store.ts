import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { HEUBACH } from '../locations/location';
import { DailyForecast } from './daily-forecast.entity';
import type { ForecastStore, StoredForecast } from './forecast.store';

/**
 * `ForecastStore` auf SQLite (Schritt 9, Tabelle `daily_forecast`), gleiches Token wie der In-Memory-Store.
 * Ein Abruf überschreibt seine Tage (`UNIQUE(location_id, date)`); `getLatest` liefert die Tage des jüngsten
 * Abrufs (`fetched_at`), so wie bisher die zuletzt gespeicherte Vorhersage als Ganzes.
 */
@Injectable()
export class TypeOrmForecastStore implements ForecastStore {
  constructor(@InjectRepository(DailyForecast) private readonly repository: Repository<DailyForecast>) {}

  async getLatest(): Promise<StoredForecast | null> {
    const latest = await this.repository
      .createQueryBuilder('f')
      .select('MAX(f.fetched_at)', 'fetchedAt')
      .where('f.location_id = :locationId', { locationId: HEUBACH.id })
      .getRawOne<{ fetchedAt: string | null }>();
    if (!latest?.fetchedAt) return null;

    const rows = await this.repository.find({
      where: { locationId: HEUBACH.id, fetchedAt: latest.fetchedAt },
      order: { date: 'ASC' },
    });
    return {
      days: rows.map(row => ({
        date: row.date,
        maxTemp: row.maxTemp,
        minTemp: row.minTemp,
        precipitationSum: row.precipitationSum,
        weatherCode: row.weatherCode,
      })),
      fetchedAt: latest.fetchedAt,
      importId: rows[0]?.importId ?? null,
    };
  }

  async save(forecast: StoredForecast): Promise<void> {
    if (forecast.days.length === 0) return;
    await this.repository.manager.transaction(async manager => {
      for (const day of forecast.days) {
        await manager.query(
          `INSERT INTO "daily_forecast" ("location_id", "date", "max_temp", "min_temp", "precipitation_sum", "weather_code", "fetched_at", "import_id")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT ("location_id", "date") DO UPDATE SET "max_temp" = excluded."max_temp", "min_temp" = excluded."min_temp",
             "precipitation_sum" = excluded."precipitation_sum", "weather_code" = excluded."weather_code",
             "fetched_at" = excluded."fetched_at", "import_id" = excluded."import_id"`,
          [
            HEUBACH.id,
            day.date,
            day.maxTemp,
            day.minTemp,
            day.precipitationSum,
            day.weatherCode,
            forecast.fetchedAt,
            forecast.importId,
          ],
        );
      }
    });
  }
}
