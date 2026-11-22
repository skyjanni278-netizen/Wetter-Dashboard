/**
 * Typen der neuen NestJS-API (`api/`, Zielbild B2.2), Stand Schritt 8 (Listen und Zusammenfassungen).
 * Messwerte sind `number | null`: fehlende Werte kommen als `null`, nie als 0 (F15).
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

/** Herkunft einer Stunde (B2.2); `null` = unbekannt (Altbestand bis Schritt 9). */
export type ObservationSource = 'archive' | 'forecast_api' | 'prediction';

/**
 * Stunde eines Tages; `timeLocal` ist Berliner Ortszeit (im Altbestand ohne Offset).
 * Werte ungerundet wie gespeichert; gerundet wird erst bei der Ausgabe (Unit-Pipe).
 */
export interface DayHour {
  timeLocal: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  source: ObservationSource | null;
  /** R08: Vorhersage (gespeichert als solche oder Stunde nach „jetzt“). */
  isPrediction: boolean;
  /** Korrekturen ab Schritt 12a; bis dahin `null`. */
  correctedAt: string | null;
}

/** Temperatur der vergangenen Stunden; `minAt`/`maxAt` = `timeLocal` der Stunde. */
export interface DayTemperature {
  mean: number | null;
  min: number | null;
  max: number | null;
  minAt: string | null;
  maxAt: string | null;
}

/** Aktuelle Stunde (US01-6), nur heute; die Werte stehen in `hours[]` mit gleichem `timeLocal`. */
export interface DayCurrent {
  /** Bis Schritt 9 `null`. */
  observationId: number | null;
  timeLocal: string;
}

/**
 * `GET /api/days/:date` und `GET /api/days/today`. `observed` rechnet nur vergangene Stunden,
 * `predicted` nur Vorhersagestunden (F13); berechnete Werte auf eine Nachkommastelle gerundet.
 */
export interface Day {
  id: string;
  date: string;
  locationId: number;
  timezone: string;
  isToday: boolean;
  hoursExpected: number;
  hoursObserved: number;
  hoursPredicted: number;
  complete: boolean;
  /** `null` an anderen Tagen als heute oder ohne vergangene Stunde. */
  current: DayCurrent | null;
  observed: {
    temperature: DayTemperature;
    precipitationSum: number | null;
    /** R09, nur bei vollständigen Tagen; sonst `null`. */
    isDryDay: boolean | null;
  };
  predicted: {
    temperature: { min: number | null; max: number | null };
    precipitationSum: number | null;
  };
  hours: DayHour[];
}

/**
 * Eintrag aus `GET /api/days?from&to` (B2.2 „day (Listeneintrag)“): ohne Stunden, Werte wie
 * `Day.observed` (ohne Vorhersagestunden), gerundet.
 */
export interface DayListItem {
  id: string;
  date: string;
  locationId: number;
  hoursExpected: number;
  hoursObserved: number;
  complete: boolean;
  temperature: { mean: number | null; min: number | null; max: number | null };
  precipitationSum: number | null;
  isDryDay: boolean | null;
  /** Korrekturen ab Schritt 12a; bis dahin `false`. */
  hasCorrections: boolean;
}

/** `GET /api/days?from&to`: nur Tage mit Daten, aufsteigend; Zeitraum ohne Daten → `items = []`. */
export interface DayList {
  items: DayListItem[];
  meta: { from: string; to: string; count: number };
}

/** R12: Monats- und Jahresmittel = Mittel der Tagesmittel vollständiger Tage. */
export type MeanMethod = 'mean_of_daily_means';

/** Gemeinsame Felder der Zusammenfassungen (B2.2), Werte gerundet, nur vollständige Tage. */
interface SummaryBase {
  locationId: number;
  daysExpected: number;
  daysComplete: number;
  /** R13: `daysComplete = daysExpected`; laufender Monat und laufendes Jahr sind `false`. */
  complete: boolean;
  temperature: DayTemperature;
  precipitationSum: number | null;
  dryDays: number;
  meanMethod: MeanMethod;
}

/** `GET /api/summaries/months/:yearMonth`, z. B. `id = "2026-11"`. */
export interface MonthSummary extends SummaryBase {
  id: string;
  year: number;
  month: number;
}

/** `GET /api/summaries/years/:year` */
export interface YearSummary extends SummaryBase {
  id: string;
  year: number;
  monthsWithData: number;
}

/** `GET /api/summaries/months?year=`: Monate des Jahres mit Daten, aufsteigend. */
export interface MonthSummaryList {
  items: MonthSummary[];
}

/** Eintrag aus `GET /api/summaries/years` (Jahresauswahl, F20). */
export interface YearListItem {
  id: string;
  year: number;
  complete: boolean;
  daysComplete: number;
}

/** `GET /api/summaries/years`: Jahre mit Daten, aufsteigend; ohne Daten `items = []`. */
export interface YearList {
  items: YearListItem[];
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

/** Stundenrekord (US06): höchster bzw. niedrigster vergangener Stundenwert. */
export interface HourRecord {
  value: number | null;
  timeLocal: string;
  date: string;
  /** Bis Schritt 9 `null`. */
  observationId: number | null;
  /** Bis Schritt 12a immer `false`. */
  corrected: boolean;
}

/** `GET /api/records`. Ohne Daten sind alle vier Rekorde `null` und `daysCounted = 0` (US06-5). */
export interface Records {
  locationId: number;
  hottest: HourRecord | null;
  coldest: HourRecord | null;
  wettestDay: { value: number | null; date: string } | null;
  longestDryPeriod: { days: number; from: string; to: string } | null;
  /** Zahl der vollständigen Tage. */
  daysCounted: number;
  excludesPredictions: true;
}

/** Fehler an einem Feld (B3.3). `field` ist der Pfad im Body, Query oder Pfad (`date`, `to`); `null` = ganzes Objekt. */
export interface ApiFieldError {
  field: string | null;
  /** Zod-Code (`unrecognized_keys`, `too_small` …) oder eigener Code (`invalid_date`, `to_before_from`, `range_too_long`). */
  code: string;
  message: string;
}

/**
 * Fehlerantwort der neuen API (B3.3), ab Schritt 5 für jeden Fehler. Der `apiErrorInterceptor`
 * übersetzt auch Antworten, die nicht B3.3 sind (Express, Proxy, Netzwerk), in diese Form; dann
 * fehlen `path`, `timestamp` und `requestId`.
 */
export interface ApiError {
  /** HTTP-Status; `0` = keine Antwort (Netzwerkfehler). */
  statusCode: number;
  error: string;
  /** Fester Code aus B3.3, z. B. `VALIDATION_FAILED`, `DATE_IN_FUTURE`, `NO_DATA`, `NOT_FOUND`, `INTERNAL_ERROR`. */
  code: string;
  message: string;
  /** Immer ein Array; leer bei Fehlern ohne Feldbezug. */
  errors: ApiFieldError[];
  /** Zusatzangaben, z. B. `{ dataFrom: "2025-01-01" }` bei `NO_DATA`, `{ runningImportId: 42 }` bei `IMPORT_RUNNING`. */
  details: Record<string, unknown> | null;
  path?: string;
  timestamp?: string;
  requestId?: string;
}

/** `user` in der Antwort von `POST /api/auth/tokens` (B4.6). */
export interface TokenUser {
  id: number;
  username: string;
  roles: string[];
}

/** Antwort von `POST /api/auth/tokens` (03 B2.2 „token“, B4.6). */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Laufzeit in Sekunden (Standard 3600). */
  expiresIn: number;
  user: TokenUser;
}

/** Antwort von `GET /api/auth/me` (03 B2.2 „user“); `passwordHash` kommt nie vor. */
export interface UserResource {
  id: number;
  username: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}
