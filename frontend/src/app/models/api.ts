/**
 * Typen der neuen NestJS-API (`api/`, Zielbild B2.2), Stand Schritt 12a (dazu Importe, Lücken, Health,
 * Korrekturen und Datenstand).
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

/**
 * `GET /api/status`: Datenstand ohne Fehlertext (US07-1, US17-1). Datumswerte als `YYYY-MM-DD`,
 * Zeitpunkte in UTC (`2026-11-19T13:05:12Z`). `today` ist der Berliner Tag laut Server-Uhr (auch mit
 * `FAKE_NOW`); das Frontend nimmt „heute“ von hier statt aus der Browser-Uhr (03 B4.8).
 */
export interface Status {
  locationId: number;
  today: string;
  timezone: string;
  dataFrom: string | null;
  dataTo: string | null;
  /** Ende des letzten erfolgreichen Imports `scheduled`/`range`/`gaps` (R25); `null` = noch keiner. */
  lastSuccessfulUpdateAt: string | null;
  /** Nächster Lauf des Schedulers (N01); `null`, wenn der Scheduler aus ist (US16-3). */
  nextScheduledUpdateAt: string | null;
  /** R25: `ok` bis 2 h nach dem letzten Erfolg, danach `delayed`; ohne Erfolg `never`. */
  updateState: UpdateState;
  /** R26 (N04): Tage mit mindestens einer Stunde von `dataFrom` bis heute. */
  daysWithData: number;
  /** R26: vollständige Tage (R13). */
  daysComplete: number;
  /** R26: Zahl der Lücken (gleich der Länge von `GET /api/gaps` über den ganzen Zeitraum). */
  gapCount: number;
}

/** Herkunft einer Stunde (B2.2); `null` = unbekannt (Altbestand bis Schritt 9). */
export type ObservationSource = 'archive' | 'forecast_api' | 'prediction';

/**
 * Stunde eines Tages; `timeLocal` ist Berliner Ortszeit (im Altbestand ohne Offset).
 * Werte ungerundet wie gespeichert; gerundet wird erst bei der Ausgabe (Unit-Pipe).
 */
export interface DayHour {
  /** `observation.id` (seit 12a) für `GET`/`PATCH /api/observations/:id`. */
  id: number;
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
  /** Zeitpunkt der wirksamen Korrektur (UTC) oder `null` (US13-12: Chip „KORRIGIERT“). */
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
  /** Mindestens eine Stunde des Tages mit wirksamer Korrektur (US13-12). */
  hasCorrections: boolean;
}

/** `GET /api/days?from&to`: nur Tage mit Daten, aufsteigend; Zeitraum ohne Daten → `items = []`. */
export interface DayList {
  items: DayListItem[];
  meta: { from: string; to: string; count: number };
}

/** R12: Monats- und Jahresmittel = Mittel der Tagesmittel vollständiger Tage. */
export type MeanMethod = 'mean_of_daily_means';

/**
 * R27 (US18, seit Schritt 12b): Kenntage über die vollständigen Tage, Ganzzahlen ≥ 0 (ohne vollständigen Tag 0).
 * `dryDays` steht oben in der Zusammenfassung; es gilt `precipitationDays + dryDays = daysComplete`.
 */
export interface SummaryIndicators {
  frostDays: number;
  iceDays: number;
  summerDays: number;
  hotDays: number;
  precipitationDays: number;
}

/** Gemeinsame Felder der Zusammenfassungen (B2.2), Werte gerundet, nur vollständige Tage. */
export interface SummaryBase {
  locationId: number;
  daysExpected: number;
  daysComplete: number;
  /** R13: `daysComplete = daysExpected`; laufender Monat und laufendes Jahr sind `false`. */
  complete: boolean;
  temperature: DayTemperature;
  precipitationSum: number | null;
  dryDays: number;
  /** Seit Schritt 12b (R27, US18). */
  indicators: SummaryIndicators;
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

/**
 * `GET /api/summaries/periods?from&to` (R28, US19, seit Schritt 12b): freier Zeitraum (≤ 366 Tage) in der Form
 * der Jahreszusammenfassung, `id = "{from}..{to}"`, dazu `from` und `to`. Ohne Daten 404 `NO_DATA`.
 */
export interface PeriodSummary extends SummaryBase {
  id: string;
  from: string;
  to: string;
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
  /** Die Rekordstunde hat eine wirksame Korrektur (US06-7: Chip „KORRIGIERT“). */
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

/** Art eines Imports (B2.2); über HTTP startbar sind nur `range` und `gaps` (US10-8). */
export type ImportKind = 'legacy' | 'range' | 'gaps' | 'scheduled';

/** Status eines Imports (R19); `queued`/`running` = noch nicht abgeschlossen. */
export type ImportStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

/** Zähler eines Imports; `skippedCorrected` zählt Stunden, die eine Korrektur geschützt hat (R20, ab 12a). */
export interface ImportCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  skippedCorrected: number;
}

/** Warnung eines Imports, z. B. fehlende Stunde; `timeUtc` bei Bezug auf eine Stunde. */
export interface ImportWarning {
  code: string;
  message: string;
  timeUtc?: string;
}

/** Fehler eines Imports ohne Stacktrace, z. B. `UPSTREAM_TIMEOUT`, `INTERRUPTED`. */
export interface ImportFailure {
  code: string;
  message: string;
}

/** `GET /api/imports/:id`, Antwort von `POST /api/imports` und Eintrag der Liste (B2.2, US11). */
export interface ImportResource {
  id: number;
  locationId: number;
  kind: ImportKind;
  status: ImportStatus;
  /** Berliner Kalendertage `YYYY-MM-DD`; beim Altdatenimport `null`. */
  from: string | null;
  to: string | null;
  overwriteCorrections: boolean;
  requestedBy: number | null;
  /** UTC `YYYY-MM-DDTHH:MM:SSZ`. */
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  counts: ImportCounts;
  warnings: ImportWarning[];
  error: ImportFailure | null;
  links: { self: string };
}

/** Seitenangaben einer Liste (R24): `total` = alle Treffer des Filters. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

/** `GET /api/imports?status&kind&page&limit`: nach `requestedAt` absteigend (US11-2). */
export interface ImportList {
  items: ImportResource[];
  meta: PageMeta;
}

/** Query von `GET /api/imports`; ohne Angabe gilt `page = 1`, `limit = 20`. */
export interface ImportsQuery {
  status?: ImportStatus;
  kind?: ImportKind;
  page?: number;
  limit?: number;
}

/** Body von `POST /api/imports` (`ImportCreateSchema`, US10). */
export interface ImportCreateRequest {
  kind: 'range' | 'gaps';
  from: string;
  to: string;
  overwriteCorrections?: boolean;
}

/** Grund einer Lücke (US12-1). */
export type GapReason = 'missing' | 'null_values' | 'stale_prediction';

/**
 * Eintrag aus `GET /api/gaps?from&to`. `from`/`to` = Beginn der ersten/letzten Stunde in Berliner
 * Ortszeit **mit** Offset (`2026-11-12T04:00:00+01:00`); `id` = UTC der ersten Stunde.
 */
export interface Gap {
  id: string;
  from: string;
  to: string;
  hours: number;
  reason: GapReason;
}

/** `GET /api/gaps?from&to`: aufsteigend, ohne Lücken `items = []`. */
export interface GapList {
  items: Gap[];
}

/** `GET /api/health` (US14-3); bei nicht lesbarer DB 503 mit `details.database = "error"`. */
export interface Health {
  status: 'ok';
  database: 'ok';
}

/** Korrigierbares Feld einer Stunde (R16), Schreibweise der API. */
export type CorrectionField =
  | 'temperature'
  | 'apparentTemperature'
  | 'precipitation'
  | 'weatherCode'
  | 'windSpeed'
  | 'windDirection';

/**
 * `GET /api/observations/:id` (US13-1), Antwort von PATCH und Rücknahme. Die Version steht zusätzlich im
 * Header `ETag: "<version>"`; den schickt der Client als `If-Match` zurück (B3.4).
 * `timeLocal` ist hier Berliner Ortszeit **mit** Offset (`2026-11-19T14:00:00+01:00`).
 */
export interface ObservationResource {
  id: number;
  locationId: number;
  timeUtc: string;
  timeLocal: string;
  localDate: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  source: ObservationSource;
  isPrediction: boolean;
  importId: number | null;
  fetchedAt: string | null;
  correctedAt: string | null;
  version: number;
}

/** Stunde mit dem ETag aus dem Header (für `If-Match`); `etag` ist `null`, wenn der Header fehlt. */
export interface VersionedObservation {
  observation: ObservationResource;
  etag: string | null;
}

/**
 * Body von `PATCH /api/observations/:id` (JSON Merge Patch, R16): nur geänderte Felder; fehlendes Feld =
 * unverändert, `null` = „unbekannt“. `reason` ist Pflicht (3–500 Zeichen).
 */
export type ObservationPatch = Partial<Record<CorrectionField, number | null>> & { reason: string };

/** Eintrag der Korrekturhistorie (B2.2 „correction“); eine Rücknahme hat `revertsCorrectionId` (R33). */
export interface CorrectionResource {
  id: number;
  observationId: number;
  field: CorrectionField;
  oldValue: number | null;
  newValue: number | null;
  reason: string;
  correctedBy: number;
  correctedAt: string;
  revertsCorrectionId: number | null;
}

/** `GET /api/observations/:id/corrections`: neueste zuerst. */
export interface CorrectionHistory {
  items: CorrectionResource[];
}

/** Eintrag von `GET /api/corrections` (US13-14): dazu die Ortszeit der Stunde mit Offset. */
export interface CorrectionListItem extends CorrectionResource {
  observationTimeLocal: string;
}

/** `GET /api/corrections?from&to&page&limit`: nach `correctedAt` absteigend (R24). */
export interface CorrectionList {
  items: CorrectionListItem[];
  meta: PageMeta;
}

/** Query von `GET /api/corrections`; `from`/`to` = Berliner Kalendertage von `correctedAt` (Pflicht). */
export interface CorrectionsQuery {
  from: string;
  to: string;
  page?: number;
  limit?: number;
}
