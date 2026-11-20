import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BERLIN_TIMEZONE, hoursInDay } from '../common/berlin-time';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import { HEUBACH } from '../locations/location';
import type { Day } from './day';

/** US01 (Grundform) und US02-1: Tage aus dem Altbestand (vorerst ohne Service). */
@Controller('days')
export class DaysController {
  constructor(private readonly source: LegacyFileSource) {}

  /** `today` ist ein Alias; die kanonische Adresse steht in `Content-Location` (B3.1). */
  @Get('today')
  async findToday(@Res({ passthrough: true }) res: Response): Promise<Day> {
    const today = this.source.today();
    const day = await this.load(today, today);
    res.setHeader('Content-Location', `/api/days/${today}`);
    return day;
  }

  @Get(':date')
  findOne(@Param('date') date: string): Promise<Day> {
    return this.load(date, this.source.today());
  }

  private async load(date: string, today: string): Promise<Day> {
    const hours = await this.source.getDay(date);
    if (!hours) {
      // Bis Schritt 4 (Validierung) ergibt auch ein ungültiges Datum hier 404.
      throw new NotFoundException('Keine Daten für diesen Tag');
    }
    return {
      id: date,
      date,
      locationId: HEUBACH.id,
      timezone: BERLIN_TIMEZONE,
      isToday: date === today,
      hoursExpected: hoursInDay(date),
      hours: hours.map(h => ({
        timeLocal: h.time,
        temperature: h.temperature,
        apparentTemperature: h.apparentTemperature,
        precipitation: h.precipitation,
        weatherCode: h.weatherCode,
        windSpeed: h.windSpeed,
        windDirection: h.windDirection,
      })),
    };
  }
}
