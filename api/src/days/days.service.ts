import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { assertNotInFuture } from '../common/api-validation.exception';
import { BERLIN_TIMEZONE, hoursInDay, localDate } from '../common/berlin-time';
import { Clock } from '../common/clock';
import { HEUBACH } from '../locations/location';
import { OBSERVATION_STORE } from '../observations/observation.store';
import type { ObservationStore } from '../observations/observation.store';
import type { Day } from './day';

/** US01 (Grundform) und US02: Tage aus dem `ObservationStore`. Format und Kalendertag (R01) prüft vorher die Pipe. */
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

  /** R02 (US02-4): ein Tag nach dem Berliner Heute → 400 `DATE_IN_FUTURE` am Feld `date`; ohne Daten → 404. */
  async findOne(date: string): Promise<Day> {
    const today = this.today();
    assertNotInFuture('date', date, today);
    const hours = await this.store.getDay(date);
    if (!hours) {
      // `code = "NO_DATA"` mit `details.dataFrom` (R03, US02-5) kommt mit dem einheitlichen Fehlerformat (Schritt 5).
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
