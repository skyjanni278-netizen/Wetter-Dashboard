import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { round1 } from '../common/round';
import { FORECAST_STORE } from '../forecasts/forecast.store';
import type { ForecastDay, ForecastStore } from '../forecasts/forecast.store';
import { exceedsThreshold, noticeId } from './notice';
import type { Notice, NoticeList } from './notice';
import { NoticeThreshold } from './notice-threshold.entity';
import type { NoticeField } from './notice-threshold.entity';

/** Spalte der Schwelle → Wert des Vorhersagetags. */
const FORECAST_VALUE: Record<NoticeField, (day: ForecastDay) => number | null> = {
  min_temp: day => day.minTemp,
  max_temp: day => day.maxTemp,
  precipitation_sum: day => day.precipitationSum,
};

/**
 * US20, R30, R31: Hinweise auf Frost, Hitze und Starkregen aus der zuletzt abgerufenen Vorhersage
 * (`ForecastStore.getLatest`) und den Schwellen der Tabelle `notice_threshold`.
 * - R30: Vergleich ungerundet, Wert `null` → kein Hinweis; gerundet wird erst `value` in der Antwort (R11).
 * - R31: nur Tage mit `date ≥ heute` (Berliner Kalendertag laut `Clock`); heute zählt mit.
 * - Reihenfolge: nach Datum, je Tag in der Reihenfolge der Schwellen (`id`: frost, heat, heavy_rain).
 * - Ohne Vorhersage: `items = []`, `basedOnFetchedAt = null` (US20-3).
 */
@Injectable()
export class NoticesService {
  constructor(
    @Inject(FORECAST_STORE) private readonly forecasts: ForecastStore,
    @InjectRepository(NoticeThreshold) private readonly thresholds: Repository<NoticeThreshold>,
    private readonly clock: Clock,
  ) {}

  async findAll(): Promise<NoticeList> {
    const forecast = await this.forecasts.getLatest();
    if (!forecast) return { items: [], basedOnFetchedAt: null };

    const thresholds = await this.thresholds.find({ order: { id: 'ASC' } });
    const today = localDate(this.clock.now());
    const items: Notice[] = [];
    const days = forecast.days.filter(day => day.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    for (const day of days) {
      for (const threshold of thresholds) {
        const value = FORECAST_VALUE[threshold.field](day);
        if (value === null || !exceedsThreshold(value, threshold.comparator, threshold.value)) continue;
        items.push({
          id: noticeId(day.date, threshold.type),
          type: threshold.type,
          date: day.date,
          value: round1(value) as number,
          threshold: threshold.value,
          comparator: threshold.comparator,
          unit: threshold.unit,
        });
      }
    }
    return { items, basedOnFetchedAt: forecast.fetchedAt };
  }
}
