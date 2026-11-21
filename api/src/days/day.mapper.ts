import { BERLIN_TIMEZONE } from '../common/berlin-time';
import { round1 } from '../common/round';
import { HEUBACH } from '../locations/location';
import type { DayAggregate, TemperatureStats } from '../stats/aggregation.service';
import type { Day, DayListItem, DayTemperature } from './day';

/** Response-Mapper: berechnete Werte auf eine Nachkommastelle (R11, einzige Stelle mit `round1`). */
export function toDayTemperature(t: TemperatureStats): DayTemperature {
  return { mean: round1(t.mean), min: round1(t.min), max: round1(t.max), minAt: t.minAt, maxAt: t.maxAt };
}

/** Tagesaggregat → Antwort `GET /api/days/:date` (03 B2.2). Stundenwerte bleiben ungerundet. */
export function toDay(day: DayAggregate): Day {
  return {
    id: day.date,
    date: day.date,
    locationId: HEUBACH.id,
    timezone: BERLIN_TIMEZONE,
    isToday: day.isToday,
    hoursExpected: day.hoursExpected,
    hoursObserved: day.hoursObserved,
    hoursPredicted: day.hoursPredicted,
    complete: day.complete,
    current: day.current ? { observationId: null, timeLocal: day.current.timeLocal } : null,
    observed: {
      temperature: toDayTemperature(day.observed.temperature),
      precipitationSum: round1(day.observed.precipitationSum),
      isDryDay: day.observed.isDryDay,
    },
    predicted: {
      temperature: { min: round1(day.predicted.temperature.min), max: round1(day.predicted.temperature.max) },
      precipitationSum: round1(day.predicted.precipitationSum),
    },
    hours: day.hours.map(({ hour, isPrediction }) => ({
      timeLocal: hour.timeLocal,
      temperature: hour.temperature,
      apparentTemperature: hour.apparentTemperature,
      precipitation: hour.precipitation,
      weatherCode: hour.weatherCode,
      windSpeed: hour.windSpeed,
      windDirection: hour.windDirection,
      source: hour.source,
      isPrediction,
      correctedAt: null,
    })),
  };
}

/** Tagesaggregat → Listeneintrag `GET /api/days?from&to` (03 B2.2), Werte aus `observed`. */
export function toDayListItem(day: DayAggregate): DayListItem {
  const t = day.observed.temperature;
  return {
    id: day.date,
    date: day.date,
    locationId: HEUBACH.id,
    hoursExpected: day.hoursExpected,
    hoursObserved: day.hoursObserved,
    complete: day.complete,
    temperature: { mean: round1(t.mean), min: round1(t.min), max: round1(t.max) },
    precipitationSum: round1(day.observed.precipitationSum),
    isDryDay: day.observed.isDryDay,
    hasCorrections: false,
  };
}
