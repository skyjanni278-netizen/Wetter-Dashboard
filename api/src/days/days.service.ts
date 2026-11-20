import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BERLIN_TIMEZONE, hoursInDay, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import type { Day } from './day';

/** US01 (Grundform) und US02-1: Tage aus dem `ObservationStore`. */
@Injectable()
export class DaysService {
  constructor(
    @Inject(OBSERVATION_STORE) private readonly store: ObservationStore,
    private readonly clock: Clock,
  ) {}

  /** Berliner Datum von heute. */
  today(): string {
    return localDate(this.clock.now());
  }

  findToday(): Promise<Day> {
    return this.findOne(this.today());
  }

  async findOne(date: string): Promise<Day> {
    const hours = await this.store.getDay(date);
    if (!hours) {
      // Bis Schritt 4 (Validierung) ergibt auch ein ungültiges Datum hier 404.
      throw new NotFoundException('Keine Daten für diesen Tag');
    }
    return {
      id: date,
      date,
      locationId: HEUBACH.id,
      timezone: BERLIN_TIMEZONE,
      isToday: date === this.today(),
      hoursExpected: hoursInDay(date),
      hours: hours.map(h => ({
        timeLocal: h.timeLocal,
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
