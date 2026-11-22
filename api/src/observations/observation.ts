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

/**
 * Herkunft eines Werts (03 B2.2): `archive` (Open-Meteo-Archiv), `forecast_api` (vergangene Stunde aus der
 * Forecast-API), `prediction` (die Stunde lag beim Abruf in der Zukunft). Eine `prediction`, deren Zeit
 * vorbei ist, bleibt eine (veraltete) Vorhersage und zählt nie als Messwert (R08).
 */
export type ObservationSource = 'archive' | 'forecast_api' | 'prediction';

/** Gespeicherte Stunde eines Berliner Kalendertags. */
export interface ObservationHour extends ObservationValues {
  /** Berliner Ortszeit ohne Offset, z. B. `2026-11-10T14:00` (Form des Altbestands, Befund Z1). */
  timeLocal: string;
  /** UTC-Zeitpunkt `YYYY-MM-DDTHH:MM:SSZ`; `null` bei Stunden aus dem Altbestand (nur Ortszeit bekannt). */
  timeUtc: string | null;
  /**
   * Herkunft; `null` = unbekannt (Altbestand bis Schritt 9: Archiv oder Forecast-API lässt sich ohne die
   * Regeln aus 03 B2.7 nicht unterscheiden). `prediction` ist auch im Altbestand bekannt: Stunde nach der
   * Änderungszeit der Datei.
   */
  source: ObservationSource | null;
}

/** Eingabe eines Imports: Zeitpunkt immer in UTC (03 B2.6, `timezone=GMT`). */
export interface ObservationInput extends ObservationValues {
  timeUtc: string;
  /** Abgefragte API; ob die Stunde eine Vorhersage ist, entscheidet der Store beim Schreiben (R08). */
  source?: 'archive' | 'forecast_api';
  /**
   * Abrufzeitpunkt (UTC), wenn er vor dem Schreiben liegt: beim Altdatenimport die Änderungszeit der Datei
   * (03 B2.7 Schritt 6). Spalte `fetched_at` und Grenze für R08 (Stunde danach = Vorhersage). Ohne Angabe gilt
   * der Schreibzeitpunkt (`Clock.now()`), wie bei jedem Import über Open-Meteo.
   */
  fetchedAt?: string;
}

/** Stunden eines Berliner Kalendertags, wie sie der Store für Auswertungen liefert. */
export interface StoredDay {
  date: string;
  hours: ObservationHour[];
}

/** Zähler eines Schreibvorgangs (03 B2.7 Schritt 8). */
export interface UpsertCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  /** R20: Stunde mit `corrected_at`, deren Werte sich geändert hätten; sie bleibt unverändert. */
  skippedCorrected: number;
}

/**
 * `upsert`: neue Stunden anlegen, geänderte überschreiben (`kind = "range"`).
 * `insertMissing`: nur fehlende Stunden anlegen (`kind = "gaps"`). Vorhandene bleiben unberührt, außer sie
 * sind selbst eine Lücke (R08: veraltete Vorhersage; im TypeORM-Store auch `null` bei Temperatur oder
 * Niederschlag, wie `GET /api/gaps`).
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
