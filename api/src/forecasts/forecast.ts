/** Vorhersagetag nach B2.2; `id` und `importId` folgen mit der Datenbank (Schritt 9). */
export interface Forecast {
  locationId: number;
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
  fetchedAt: string;
}

export interface ForecastList {
  items: Forecast[];
  /** Abrufzeitpunkt (ISO, UTC) oder `null`, wenn es keine Vorhersage gibt (US03-2). */
  fetchedAt: string | null;
}
