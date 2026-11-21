/**
 * Altformat von Express (`backend/data/`), wie es `backend/src/weather-api.ts` schreibt.
 * Nest liest diese Dateien nur; geschrieben werden sie bis Schritt 9 allein von Express.
 */

/** Eine Stunde in einer Tagesdatei `YYYY-MM/YYYY-MM-DD.json`. `time` ist Ortszeit ohne Offset. */
export interface LegacyHourRaw {
  time: string;
  temperature?: unknown;
  apparentTemperature?: unknown;
  precipitation?: unknown;
  weathercode?: unknown;
  windspeed?: unknown;
  winddirection?: unknown;
}

export interface LegacyDayFileRaw {
  date: string;
  location?: string;
  hourly: LegacyHourRaw[];
}

/** Ein Tag in `forecast.json`. */
export interface LegacyForecastRaw {
  date: string;
  maxTemp?: unknown;
  minTemp?: unknown;
  precipitation?: unknown;
  weathercode?: unknown;
}

/** Normalisierte Stunde: fehlende oder ungültige Werte sind `null`, nichts wird gerundet. */
export interface LegacyHour {
  /** Berliner Ortszeit ohne Offset, z. B. `2026-11-10T14:00` (Altformat, siehe Befund Z1). */
  time: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

/**
 * Inhalt einer Tagesdatei mit ihrer Änderungszeit (UTC). `null` nur ohne echte Datei dahinter
 * (Testersatz `FakeLegacySource`).
 */
export interface LegacyDayFile {
  hours: LegacyHour[];
  modifiedAt: string | null;
}

/** Normalisierter Vorhersagetag. */
export interface LegacyForecastDay {
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
}

export interface LegacyForecast {
  days: LegacyForecastDay[];
  /** Änderungszeit von `forecast.json` (ISO, UTC); die Datei selbst enthält keinen Abrufzeitpunkt. */
  fetchedAt: string;
}
