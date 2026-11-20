import { addDays } from '../common/berlin-time';
import type { HourlyRequest } from '../weather-provider/open-meteo.client';

/** Die letzten Tage kommen aus der Forecast-API, ältere aus dem Archiv (Verzug ca. 5 Tage), wie `backfill.ts`. */
export const RECENT_DAYS = 10;

/** Eine Abfrage plus die Berliner Kalendertage, die aus ihrer Antwort übernommen werden. */
export interface PlannedRequest {
  request: HourlyRequest;
  fromLocal: string;
  toLocal: string;
}

/**
 * Teilt die Berliner Kalendertage `from` bis `to` in höchstens zwei Abfragen (Archiv, Forecast).
 * Open-Meteo rechnet mit `timezone=GMT` in UTC-Tagen. Der Berliner Tag D beginnt am UTC-Tag D − 1
 * (22:00 bzw. 23:00 UTC) und endet am UTC-Tag D, deshalb beginnt jede Abfrage einen UTC-Tag früher.
 */
export function planHourlyRequests(from: string, to: string, today: string): PlannedRequest[] {
  if (from > to) return [];
  const recentStart = addDays(today, -RECENT_DAYS);
  const plans: PlannedRequest[] = [];

  const archiveTo = to < recentStart ? to : addDays(recentStart, -1);
  if (from <= archiveTo) {
    plans.push({
      request: { source: 'archive', startDate: addDays(from, -1), endDate: archiveTo },
      fromLocal: from,
      toLocal: archiveTo,
    });
  }

  const forecastFrom = from > recentStart ? from : recentStart;
  if (forecastFrom <= to) {
    plans.push({
      request: { source: 'forecast', startDate: addDays(forecastFrom, -1), endDate: to },
      fromLocal: forecastFrom,
      toLocal: to,
    });
  }
  return plans;
}
