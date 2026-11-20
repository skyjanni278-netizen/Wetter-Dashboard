/**
 * Hilfen für Unit- und e2e-Tests (nicht Teil des Builds, `tsconfig.build.json` schließt `test/` aus).
 * Kein Test ruft Open-Meteo wirklich auf: Antworten entstehen hier.
 */
import type { LegacyFileSource } from '../../src/legacy/legacy-file-source';
import type { LegacyDayFile, LegacyForecast, LegacyHour } from '../../src/legacy/legacy-types';
import type { FetchFn, ProviderForecastDay, ProviderHour } from '../../src/weather-provider/open-meteo.client';

const HOUR_MS = 60 * 60 * 1000;

type Values = Omit<ProviderHour, 'timeUtc'>;

/** Standardwerte einer Stunde, abhängig vom Index; `override` ersetzt einzelne Werte. */
export function hourValues(index: number, override: Partial<Values> = {}): Values {
  return {
    temperature: 10 + index / 10,
    apparentTemperature: 8,
    precipitation: 0,
    weatherCode: 3,
    windSpeed: 12.5,
    windDirection: 220,
    ...override,
  };
}

/** `count` aufeinanderfolgende Stunden ab `startUtc` (z. B. `2026-09-30T00:00:00Z`). */
export function providerHours(
  startUtc: string,
  count: number,
  valueOf: (index: number) => Partial<Values> = () => ({}),
): ProviderHour[] {
  const start = Date.parse(startUtc);
  return Array.from({ length: count }, (_, i) => ({
    timeUtc: new Date(start + i * HOUR_MS).toISOString().replace('.000Z', 'Z'),
    ...hourValues(i, valueOf(i)),
  }));
}

/** Antwort von Open-Meteo (`hourly`, `timezone=GMT`) für die gegebenen Stunden. */
export function openMeteoHourlyBody(hours: readonly ProviderHour[]): Record<string, unknown> {
  return {
    latitude: 48.8,
    longitude: 9.94,
    generationtime_ms: 0.1,
    utc_offset_seconds: 0,
    timezone: 'GMT',
    timezone_abbreviation: 'GMT',
    hourly_units: { time: 'iso8601' },
    hourly: {
      time: hours.map(h => h.timeUtc.slice(0, 16)),
      temperature_2m: hours.map(h => h.temperature),
      apparent_temperature: hours.map(h => h.apparentTemperature),
      precipitation: hours.map(h => h.precipitation),
      weather_code: hours.map(h => h.weatherCode),
      wind_speed_10m: hours.map(h => h.windSpeed),
      wind_direction_10m: hours.map(h => h.windDirection),
    },
  };
}

export function forecastDays(firstDate: string, count = 7): ProviderForecastDay[] {
  const start = Date.parse(`${firstDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * 24 * HOUR_MS).toISOString().slice(0, 10),
    maxTemp: 8.6,
    minTemp: 2.1,
    precipitationSum: 1.2,
    weatherCode: 61,
  }));
}

/** Antwort von Open-Meteo (`daily`, `timezone=Europe/Berlin`; Standard MEZ = 3600 s). */
export function openMeteoDailyBody(
  days: readonly ProviderForecastDay[],
  utcOffsetSeconds = 3600,
): Record<string, unknown> {
  return {
    utc_offset_seconds: utcOffsetSeconds,
    timezone: 'Europe/Berlin',
    daily: {
      time: days.map(d => d.date),
      temperature_2m_max: days.map(d => d.maxTemp),
      temperature_2m_min: days.map(d => d.minTemp),
      precipitation_sum: days.map(d => d.precipitationSum),
      weather_code: days.map(d => d.weatherCode),
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** `fetch`-Ersatz: `hourly`- und `daily`-Abfragen bekommen je eine eigene Antwort. */
export function fakeFetch(handlers: {
  hourly?: (url: URL) => Response | Promise<Response>;
  daily?: (url: URL) => Response | Promise<Response>;
}): jest.Mock<Promise<Response>, Parameters<FetchFn>> {
  return jest.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.searchParams.has('hourly') && handlers.hourly) return handlers.hourly(url);
    if (url.searchParams.has('daily') && handlers.daily) return handlers.daily(url);
    throw new Error(`Unerwartete Abfrage: ${url.toString()}`);
  });
}

/** 24 Stunden eines Tages im Altformat (Ortszeit ohne Offset). */
export function legacyDay(date: string, valueOf: (hour: number) => Partial<Values> = () => ({})): LegacyHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    ...hourValues(hour, valueOf(hour)),
  }));
}

/**
 * Ersatz für `LegacyFileSource` ohne Dateien; `days`, `modifiedAt` (Änderungszeit je Tag, wie bei der
 * heutigen Datei) und `forecast` lassen sich im Test ändern.
 */
export class FakeLegacySource {
  readonly modifiedAt = new Map<string, string>();

  constructor(
    readonly days = new Map<string, LegacyHour[]>(),
    public forecast: LegacyForecast | null = null,
  ) {}

  async getDay(date: string): Promise<LegacyHour[] | null> {
    return this.days.get(date) ?? null;
  }

  async getDayFile(date: string): Promise<LegacyDayFile | null> {
    const hours = this.days.get(date);
    return hours ? { hours, modifiedAt: this.modifiedAt.get(date) ?? null } : null;
  }

  async getDataRange(): Promise<{ from: string | null; to: string | null }> {
    const dates = [...this.days.keys()].sort();
    return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
  }

  async getForecast(): Promise<LegacyForecast | null> {
    return this.forecast;
  }

  asSource(): LegacyFileSource {
    return this as unknown as LegacyFileSource;
  }
}
