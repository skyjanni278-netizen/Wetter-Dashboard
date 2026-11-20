/**
 * Stundenwerte („Observation“, 03 B2) in der Form, die die Stores austauschen.
 * Werte sind `number | null` und ungerundet; gerundet wird erst bei der Ausgabe.
 */
export interface ObservationValues {
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

export const OBSERVATION_FIELDS: readonly (keyof ObservationValues)[] = [
  'temperature',
  'apparentTemperature',
  'precipitation',
  'weatherCode',
  'windSpeed',
  'windDirection',
];

/** Gespeicherte Stunde eines Berliner Kalendertags. */
export interface ObservationHour extends ObservationValues {
  /** Berliner Ortszeit ohne Offset, z. B. `2026-11-10T14:00` (Form des Altbestands, Befund Z1). */
  timeLocal: string;
  /** UTC-Zeitpunkt `YYYY-MM-DDTHH:MM:SSZ`; `null` bei Stunden aus dem Altbestand (nur Ortszeit bekannt). */
  timeUtc: string | null;
}

/** Eingabe eines Imports: Zeitpunkt immer in UTC (03 B2.6, `timezone=GMT`). */
export interface ObservationInput extends ObservationValues {
  timeUtc: string;
}

/** Zähler eines Schreibvorgangs (03 B2.7 Schritt 8). */
export interface UpsertCounts {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * `upsert`: neue Stunden anlegen, geänderte überschreiben (`kind = "range"`).
 * `insertMissing`: nur fehlende Stunden anlegen, vorhandene bleiben unberührt (`kind = "gaps"`).
 */
export type UpsertMode = 'upsert' | 'insertMissing';

export interface DataRange {
  from: string | null;
  to: string | null;
}

export function sameValues(a: ObservationValues, b: ObservationValues): boolean {
  return OBSERVATION_FIELDS.every(field => a[field] === b[field]);
}

export function pickValues(source: ObservationValues): ObservationValues {
  return {
    temperature: source.temperature,
    apparentTemperature: source.apparentTemperature,
    precipitation: source.precipitation,
    weatherCode: source.weatherCode,
    windSpeed: source.windSpeed,
    windDirection: source.windDirection,
  };
}
