import { z } from 'zod';
import { API_ERROR_CODES } from '../common/api-error';
import type { ApiErrorBody } from '../common/api-error';
import type { Day, DayList } from '../days/day';
import type { ForecastList } from '../forecasts/forecast';
import type { Health } from '../health/health';
import { IMPORT_KINDS, IMPORT_STATUSES } from '../imports/import';
import type { ImportList, ImportResource } from '../imports/import';
import type { Location } from '../locations/location';
import { GAP_REASONS } from '../observations/gap';
import type { GapList } from '../observations/gap';
import type { Records } from '../records/record';
import type { Status } from '../status/status';
import type { MonthSummary, MonthSummaryList, YearList, YearSummary } from '../summaries/summary';

/**
 * Antwortschemas für die OpenAPI-Dokumentation (03 B3.7). Die Antworttypen sind TypeScript-Interfaces
 * neben den Ressourcen; diese Zod-Fassungen dienen nur der Doku. Damit beide nicht auseinanderlaufen,
 * prüft der Compiler am Dateiende für jedes Schema, dass `z.infer` **genau** dem Interface entspricht
 * (`npm run build` scheitert sonst).
 */

const ymd = () => z.string().describe('Berliner Kalendertag YYYY-MM-DD');
const utc = () => z.string().describe('UTC-Zeitpunkt YYYY-MM-DDTHH:MM:SSZ');
const localTime = () => z.string().describe('Berliner Ortszeit ohne Offset, z. B. 2026-11-19T14:00 (bis Schritt 9)');
const num = () => z.number().nullable();

export const ApiFieldErrorSchema = z.object({
  field: z.string().nullable().describe('Pfad im Body, Query- oder Pfadparameter; null = ganzes Objekt'),
  code: z.string().describe('Zod-Code oder invalid_date, to_before_from, range_too_long'),
  message: z.string(),
});

/** Fehlerformat B3.3 (jede Fehlerantwort, `components.schemas.ApiError`). */
export const ApiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
  errors: z.array(ApiFieldErrorSchema),
  path: z.string(),
  timestamp: utc(),
  requestId: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
});

export const LocationSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  postalCode: z.string(),
  region: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  isDefault: z.boolean(),
});

export const LocationListSchema = z.object({ items: z.array(LocationSchema) });

const DayTemperatureSchema = z.object({
  mean: num(),
  min: num(),
  max: num(),
  minAt: localTime().nullable(),
  maxAt: localTime().nullable(),
});

const SourceSchema = z.enum(['archive', 'forecast_api', 'prediction']).nullable();

export const DaySchema = z.object({
  id: z.string(),
  date: ymd(),
  locationId: z.number().int(),
  timezone: z.string(),
  isToday: z.boolean(),
  hoursExpected: z.number().int(),
  hoursObserved: z.number().int(),
  hoursPredicted: z.number().int(),
  complete: z.boolean(),
  current: z.object({ observationId: z.number().int().nullable(), timeLocal: localTime() }).nullable(),
  observed: z.object({
    temperature: DayTemperatureSchema,
    precipitationSum: num(),
    isDryDay: z.boolean().nullable(),
  }),
  predicted: z.object({
    temperature: z.object({ min: num(), max: num() }),
    precipitationSum: num(),
  }),
  hours: z.array(
    z.object({
      timeLocal: localTime(),
      temperature: num(),
      apparentTemperature: num(),
      precipitation: num(),
      weatherCode: num(),
      windSpeed: num(),
      windDirection: num(),
      source: SourceSchema,
      isPrediction: z.boolean(),
      correctedAt: z.string().nullable(),
    }),
  ),
});

export const DayListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      date: ymd(),
      locationId: z.number().int(),
      hoursExpected: z.number().int(),
      hoursObserved: z.number().int(),
      complete: z.boolean(),
      temperature: z.object({ mean: num(), min: num(), max: num() }),
      precipitationSum: num(),
      isDryDay: z.boolean().nullable(),
      hasCorrections: z.boolean(),
    }),
  ),
  meta: z.object({ from: ymd(), to: ymd(), count: z.number().int() }),
});

export const ForecastListSchema = z.object({
  items: z.array(
    z.object({
      locationId: z.number().int(),
      date: ymd(),
      maxTemp: num(),
      minTemp: num(),
      precipitationSum: num(),
      weatherCode: num(),
      fetchedAt: utc(),
    }),
  ),
  fetchedAt: utc().nullable(),
});

const summaryBase = {
  locationId: z.number().int(),
  daysExpected: z.number().int(),
  daysComplete: z.number().int(),
  complete: z.boolean(),
  temperature: DayTemperatureSchema,
  precipitationSum: num(),
  dryDays: z.number().int(),
  meanMethod: z.literal('mean_of_daily_means'),
};

export const MonthSummarySchema = z.object({
  id: z.string().describe('YYYY-MM'),
  year: z.number().int(),
  month: z.number().int(),
  ...summaryBase,
});

export const MonthSummaryListSchema = z.object({ items: z.array(MonthSummarySchema) });

export const YearSummarySchema = z.object({
  id: z.string().describe('YYYY'),
  year: z.number().int(),
  ...summaryBase,
  monthsWithData: z.number().int(),
});

export const YearListSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), year: z.number().int(), complete: z.boolean(), daysComplete: z.number().int() }),
  ),
});

const HourRecordSchema = z.object({
  value: num(),
  timeLocal: localTime(),
  date: ymd(),
  observationId: z.number().int().nullable(),
  corrected: z.boolean(),
});

export const RecordsSchema = z.object({
  locationId: z.number().int(),
  hottest: HourRecordSchema.nullable(),
  coldest: HourRecordSchema.nullable(),
  wettestDay: z.object({ value: num(), date: ymd() }).nullable(),
  longestDryPeriod: z.object({ days: z.number().int(), from: ymd(), to: ymd() }).nullable(),
  daysCounted: z.number().int(),
  excludesPredictions: z.literal(true),
});

export const StatusSchema = z.object({
  locationId: z.number().int(),
  today: ymd(),
  timezone: z.string(),
  dataFrom: ymd().nullable(),
  dataTo: ymd().nullable(),
  lastSuccessfulUpdateAt: utc().nullable(),
  updateState: z.enum(['never', 'ok', 'delayed']),
});

export const ImportResourceSchema = z.object({
  id: z.number().int(),
  locationId: z.number().int(),
  kind: z.enum(IMPORT_KINDS),
  status: z.enum(IMPORT_STATUSES),
  from: ymd().nullable(),
  to: ymd().nullable(),
  overwriteCorrections: z.boolean(),
  requestedBy: z.number().int().nullable(),
  requestedAt: utc(),
  startedAt: utc().nullable(),
  finishedAt: utc().nullable(),
  counts: z.object({
    inserted: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    skippedCorrected: z.number().int(),
  }),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), timeUtc: z.string().optional() })),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  links: z.object({ self: z.string() }),
});

export const ImportListSchema = z.object({
  items: z.array(ImportResourceSchema),
  meta: z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int() }),
});

export const GapSchema = z.object({
  id: utc().describe('UTC-Zeitpunkt der ersten Stunde'),
  from: z.string().describe('Beginn der ersten Stunde, Berliner Ortszeit mit Offset, z. B. 2026-11-12T04:00:00+01:00'),
  to: z.string().describe('Beginn der letzten Stunde, Berliner Ortszeit mit Offset'),
  hours: z.number().int(),
  reason: z.enum(GAP_REASONS),
});

export const GapListSchema = z.object({ items: z.array(GapSchema) });

export const HealthSchema = z.object({ status: z.literal('ok'), database: z.literal('ok') });

/** Genau gleiche Typen (auch Optionalität und `null`), sonst `false`. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

/** Compiler-Prüfung: jedes Doku-Schema entspricht dem Antworttyp (scheitert beim Build, wenn nicht). */
export type ResponseSchemaChecks = [
  Assert<Equals<z.infer<typeof ApiErrorSchema>, ApiErrorBody>>,
  Assert<Equals<z.infer<typeof LocationSchema>, Location>>,
  Assert<Equals<z.infer<typeof DaySchema>, Day>>,
  Assert<Equals<z.infer<typeof DayListSchema>, DayList>>,
  Assert<Equals<z.infer<typeof ForecastListSchema>, ForecastList>>,
  Assert<Equals<z.infer<typeof MonthSummarySchema>, MonthSummary>>,
  Assert<Equals<z.infer<typeof MonthSummaryListSchema>, MonthSummaryList>>,
  Assert<Equals<z.infer<typeof YearSummarySchema>, YearSummary>>,
  Assert<Equals<z.infer<typeof YearListSchema>, YearList>>,
  Assert<Equals<z.infer<typeof RecordsSchema>, Records>>,
  Assert<Equals<z.infer<typeof StatusSchema>, Status>>,
  Assert<Equals<z.infer<typeof ImportResourceSchema>, ImportResource>>,
  Assert<Equals<z.infer<typeof ImportListSchema>, ImportList>>,
  Assert<Equals<z.infer<typeof GapListSchema>, GapList>>,
  Assert<Equals<z.infer<typeof HealthSchema>, Health>>,
];
