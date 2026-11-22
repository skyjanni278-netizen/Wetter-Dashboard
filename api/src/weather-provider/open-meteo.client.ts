import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { z } from 'zod';
import { BERLIN_TIMEZONE } from '../common/berlin-time';
import {
  DAILY_VARIABLES,
  HOURLY_VARIABLES,
  OpenMeteoDailyResponseSchema,
  OpenMeteoResponseSchema,
} from './open-meteo.schema';

/** Standard-Adressen der Open-Meteo-API; die App nimmt sie aus der Konfiguration (`OPEN_METEO_*`, 03 B4.8). */
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** Zeitlimit je Versuch (Standard, `OPEN_METEO_TIMEOUT_MS`) und Wartezeiten vor den 2 Wiederholungen (Backoff). */
export const OPEN_METEO_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000];

/** Optionale DI-Tokens, damit Tests `fetch` und die Wartezeiten ersetzen können. */
export const OPEN_METEO_FETCH = 'OPEN_METEO_FETCH';
export const OPEN_METEO_RETRY_DELAYS_MS = 'OPEN_METEO_RETRY_DELAYS_MS';
/** Optionales DI-Token für Adressen und Zeitlimit (`WeatherProviderModule` aus dem `ConfigService`). */
export const OPEN_METEO_CONFIG = 'OPEN_METEO_CONFIG';

/** Adressen und Zeitlimit; nur aus der Konfiguration, nie aus einer Anfrage (C1 A01, SSRF). */
export interface OpenMeteoConfig {
  forecastUrl: string;
  archiveUrl: string;
  timeoutMs: number;
}

export const DEFAULT_OPEN_METEO_CONFIG: OpenMeteoConfig = {
  forecastUrl: OPEN_METEO_FORECAST_URL,
  archiveUrl: OPEN_METEO_ARCHIVE_URL,
  timeoutMs: OPEN_METEO_TIMEOUT_MS,
};

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Fehlercodes des Providers. `UPSTREAM_INVALID`: Antwort verletzt das Schema oder ist kein JSON (R32).
 * `UPSTREAM_TIMEOUT`: keine Antwort innerhalb des Zeitlimits. `UPSTREAM_ERROR`: HTTP-Fehler oder Netzwerk.
 */
export type OpenMeteoErrorCode = 'UPSTREAM_INVALID' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_ERROR';

export class OpenMeteoError extends Error {
  constructor(
    readonly code: OpenMeteoErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'OpenMeteoError';
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** `archive`: Reanalyse (einige Tage Verzug); `forecast`: Forecast-API, auch für die letzten Tage. */
export type HourlySource = 'archive' | 'forecast';

/** Abfrage der Stundenwerte; `startDate`/`endDate` sind **UTC**-Kalendertage (`timezone=GMT`). */
export interface HourlyRequest {
  source: HourlySource;
  startDate: string;
  endDate: string;
}

/** Eine Stunde vom Provider: Zeitpunkt in UTC, Werte `number | null`. */
export interface ProviderHour {
  timeUtc: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

/** Ein Tag der Tagesvorhersage (`daily`); `date` ist ein Berliner Kalendertag (`timezone=Europe/Berlin`). */
export interface ProviderForecastDay {
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map(issue => `${issue.path.length ? issue.path.join('.') : '(Antwort)'}: ${issue.message}`)
    .join('; ');
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Client für Open-Meteo (WeatherProviderModule, ohne Datenbank). Natives `fetch`, 15 s Zeitlimit je
 * Versuch, 2 Wiederholungen mit Backoff. Stundenwerte mit `timezone=GMT`, Tagesvorhersage mit
 * `timezone=Europe/Berlin` (Berliner Kalendertage). Jede Antwort wird mit Zod geprüft (R32).
 */
@Injectable()
export class OpenMeteoClient {
  private readonly logger = new Logger(OpenMeteoClient.name);
  private readonly fetchFn: FetchFn;
  private readonly retryDelays: readonly number[];
  private readonly config: OpenMeteoConfig;

  constructor(
    @Optional() @Inject(OPEN_METEO_FETCH) fetchFn?: FetchFn,
    @Optional() @Inject(OPEN_METEO_RETRY_DELAYS_MS) retryDelays?: readonly number[],
    @Optional() @Inject(OPEN_METEO_CONFIG) config?: OpenMeteoConfig,
  ) {
    this.fetchFn = fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.retryDelays = retryDelays ?? DEFAULT_RETRY_DELAYS_MS;
    this.config = config ?? DEFAULT_OPEN_METEO_CONFIG;
  }

  /** Stundenwerte für die UTC-Tage `startDate` bis `endDate`. */
  async fetchHourly(request: HourlyRequest, location: Coordinates): Promise<ProviderHour[]> {
    const url = new URL(request.source === 'archive' ? this.config.archiveUrl : this.config.forecastUrl);
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: Object.values(HOURLY_VARIABLES).join(','),
      timezone: 'GMT',
      start_date: request.startDate,
      end_date: request.endDate,
    }).toString();

    const parsed = OpenMeteoResponseSchema.safeParse(await this.getJson(url));
    if (!parsed.success) {
      throw new OpenMeteoError('UPSTREAM_INVALID', `Antwort von Open-Meteo ungültig: ${describeIssues(parsed.error)}`);
    }
    const hourly = parsed.data.hourly;
    return hourly.time.map((time, i) => ({
      timeUtc: `${time}:00Z`,
      temperature: hourly[HOURLY_VARIABLES.temperature][i],
      apparentTemperature: hourly[HOURLY_VARIABLES.apparentTemperature][i],
      precipitation: hourly[HOURLY_VARIABLES.precipitation][i],
      weatherCode: hourly[HOURLY_VARIABLES.weatherCode][i],
      windSpeed: hourly[HOURLY_VARIABLES.windSpeed][i],
      windDirection: hourly[HOURLY_VARIABLES.windDirection][i],
    }));
  }

  /**
   * Tagesvorhersage über `days` Tage ab dem laufenden Berliner Tag. Einzige Abfrage mit
   * `timezone=Europe/Berlin`: Tageswerte (Max, Min, Summe) gelten für Berliner Kalendertage.
   */
  async fetchDailyForecast(location: Coordinates, days = 7): Promise<ProviderForecastDay[]> {
    const url = new URL(this.config.forecastUrl);
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      daily: Object.values(DAILY_VARIABLES).join(','),
      timezone: BERLIN_TIMEZONE,
      forecast_days: String(days),
    }).toString();

    const parsed = OpenMeteoDailyResponseSchema.safeParse(await this.getJson(url));
    if (!parsed.success) {
      throw new OpenMeteoError('UPSTREAM_INVALID', `Antwort von Open-Meteo ungültig: ${describeIssues(parsed.error)}`);
    }
    const daily = parsed.data.daily;
    return daily.time.map((date, i) => ({
      date,
      maxTemp: daily[DAILY_VARIABLES.maxTemp][i],
      minTemp: daily[DAILY_VARIABLES.minTemp][i],
      precipitationSum: daily[DAILY_VARIABLES.precipitationSum][i],
      weatherCode: daily[DAILY_VARIABLES.weatherCode][i],
    }));
  }

  /** Ein GET mit Zeitlimit und Wiederholungen; liefert das geparste JSON (noch ungeprüft). */
  private async getJson(url: URL): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt(url);
      } catch (error) {
        const failure =
          error instanceof OpenMeteoError
            ? error
            : isTimeout(error)
              ? new OpenMeteoError(
                  'UPSTREAM_TIMEOUT',
                  `Open-Meteo antwortete nicht innerhalb von ${this.config.timeoutMs / 1000} s`,
                  true,
                )
              : new OpenMeteoError(
                  'UPSTREAM_ERROR',
                  `Open-Meteo nicht erreichbar (${error instanceof Error ? error.message : String(error)})`,
                  true,
                );
        if (!failure.retryable || attempt >= this.retryDelays.length) {
          throw failure;
        }
        this.logger.warn(`${failure.message} – Wiederholung ${attempt + 1} von ${this.retryDelays.length}`);
        await delay(this.retryDelays[attempt]);
      }
    }
  }

  private async attempt(url: URL): Promise<unknown> {
    const response = await this.fetchFn(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      throw new OpenMeteoError('UPSTREAM_ERROR', `Open-Meteo antwortete mit HTTP ${response.status}`, retryable);
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new OpenMeteoError('UPSTREAM_INVALID', 'Antwort von Open-Meteo ist kein JSON');
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
