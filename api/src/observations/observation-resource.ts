import { localDateTimeWithOffset } from '../common/berlin-time';
import type { ObservationSource, ObservationValues } from './observation';

/**
 * Eine gespeicherte Stunde als Ressource (03 B2.2 „observation“, `GET /api/observations/:id`). Werte
 * ungerundet wie gespeichert; `timeLocal` ist die Berliner Ortszeit **mit** Offset. `version` ist zugleich das
 * starke ETag (`"<version>"`, B3.4).
 */
export interface ObservationResource extends ObservationValues {
  id: number;
  locationId: number;
  timeUtc: string;
  timeLocal: string;
  localDate: string;
  source: ObservationSource;
  /** R08: `source = "prediction"` oder Stunde nach „jetzt“. */
  isPrediction: boolean;
  importId: number;
  fetchedAt: string;
  correctedAt: string | null;
  version: number;
}

/** Zeile der Tabelle `observation` (snake_case), wie die Korrekturen sie lesen. */
export interface ObservationRow {
  id: number;
  location_id: number;
  time_utc: string;
  local_date: string;
  temperature: number | null;
  apparent_temperature: number | null;
  precipitation: number | null;
  weather_code: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  source: ObservationSource;
  import_id: number;
  fetched_at: string;
  corrected_at: string | null;
  version: number;
}

/** Spalten für `SELECT`/`RETURNING` einer `ObservationRow`. */
export const OBSERVATION_ROW_COLUMNS = [
  'id',
  'location_id',
  'time_utc',
  'local_date',
  'temperature',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed',
  'wind_direction',
  'source',
  'import_id',
  'fetched_at',
  'corrected_at',
  'version',
]
  .map(column => `"${column}"`)
  .join(', ');

/** R08: Vorhersage, wenn als solche gespeichert (auch veraltet) oder wenn die Stunde nach „jetzt“ beginnt. */
export function isPredictionRow(row: Pick<ObservationRow, 'source' | 'time_utc'>, now: Date): boolean {
  return row.source === 'prediction' || Date.parse(row.time_utc) > now.getTime();
}

export function valuesOfRow(row: ObservationRow): ObservationValues {
  return {
    temperature: row.temperature,
    apparentTemperature: row.apparent_temperature,
    precipitation: row.precipitation,
    weatherCode: row.weather_code,
    windSpeed: row.wind_speed,
    windDirection: row.wind_direction,
  };
}

/** Response-Mapper (feste Reihenfolge wie B2.2); nie die Zeile selbst zurückgeben. */
export function toObservationResource(row: ObservationRow, now: Date): ObservationResource {
  return {
    id: row.id,
    locationId: row.location_id,
    timeUtc: row.time_utc,
    timeLocal: localDateTimeWithOffset(new Date(row.time_utc)),
    localDate: row.local_date,
    ...valuesOfRow(row),
    source: row.source,
    isPrediction: isPredictionRow(row, now),
    importId: row.import_id,
    fetchedAt: row.fetched_at,
    correctedAt: row.corrected_at,
    version: row.version,
  };
}
