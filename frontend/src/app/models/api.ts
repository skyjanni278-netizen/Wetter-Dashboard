/**
 * Typen der neuen NestJS-API (`api/`, Zielbild B2.2) in der Grundform von Schritt 2.
 * Messwerte sind `number | null`: fehlende Werte kommen als `null`, nie als 0 (F15).
 * Felder, die erst spätere Schritte berechnen, fehlen hier noch.
 */

/** `GET /api/locations/:id` */
export interface Location {
  id: number;
  slug: string;
  name: string;
  postalCode: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isDefault: boolean;
}

/** `GET /api/locations` */
export interface LocationList {
  items: Location[];
}

export type UpdateState = 'never' | 'ok' | 'delayed';

/** `GET /api/status`: Datenstand ohne Fehlertext (US07-1). Datumswerte als `YYYY-MM-DD`. */
export interface Status {
  locationId: number;
  today: string;
  timezone: string;
  dataFrom: string | null;
  dataTo: string | null;
  lastSuccessfulUpdateAt: string | null;
  updateState: UpdateState;
}

/** Stunde eines Tages; `timeLocal` ist Berliner Ortszeit (im Altbestand ohne Offset). */
export interface DayHour {
  timeLocal: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

/** `GET /api/days/:date` und `GET /api/days/today` */
export interface Day {
  id: string;
  date: string;
  locationId: number;
  timezone: string;
  isToday: boolean;
  hoursExpected: number;
  hours: DayHour[];
}

/** Eintrag aus `GET /api/forecasts` */
export interface Forecast {
  locationId: number;
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
  fetchedAt: string;
}

/** `GET /api/forecasts` */
export interface ForecastList {
  items: Forecast[];
  fetchedAt: string | null;
}

/** Fehler an einem Feld (B3.3). `field` ist der Pfad im Body, Query oder Pfad (`date`, `to`); `null` = ganzes Objekt. */
export interface ApiFieldError {
  field: string | null;
  /** Zod-Code (`unrecognized_keys`, `too_small` …) oder eigener Code (`invalid_date`, `to_before_from`, `range_too_long`). */
  code: string;
  message: string;
}

/**
 * Fehlerantwort der neuen API (B3.3). Ab Schritt 4 für Validierungsfehler (400, `code` z. B.
 * `VALIDATION_FAILED`, `DATE_IN_FUTURE`); `path`, `timestamp` und `requestId` kommen mit Schritt 5.
 */
export interface ApiError {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  errors: ApiFieldError[];
  details: Record<string, unknown> | null;
  path?: string;
  timestamp?: string;
  requestId?: string;
}
