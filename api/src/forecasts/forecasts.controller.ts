import { Controller, Get } from '@nestjs/common';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import { HEUBACH } from '../locations/location';
import type { ForecastList } from './forecast';

/** US03-1/-2: 7-Tage-Vorhersage aus `forecast.json` (vorerst ohne Service). */
@Controller('forecasts')
export class ForecastsController {
  constructor(private readonly source: LegacyFileSource) {}

  @Get()
  async findAll(): Promise<ForecastList> {
    const forecast = await this.source.getForecast();
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
