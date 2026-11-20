import { Inject, Injectable } from '@nestjs/common';
import { HEUBACH } from '../locations/location';
import type { ForecastList } from './forecast';
import { FORECAST_STORE } from './forecast.store';
import type { ForecastStore } from './forecast.store';

/** US03-1/-2: 7-Tage-Vorhersage aus dem `ForecastStore`. */
@Injectable()
export class ForecastsService {
  constructor(@Inject(FORECAST_STORE) private readonly store: ForecastStore) {}

  async findAll(): Promise<ForecastList> {
    const forecast = await this.store.getLatest();
    if (!forecast) {
      return { items: [], fetchedAt: null };
    }
    return {
      items: forecast.days.map(day => ({
        locationId: HEUBACH.id,
        date: day.date,
        maxTemp: day.maxTemp,
        minTemp: day.minTemp,
        precipitationSum: day.precipitationSum,
        weatherCode: day.weatherCode,
        fetchedAt: forecast.fetchedAt,
      })),
      fetchedAt: forecast.fetchedAt,
    };
  }
}
