/** DI-Token für den `ForecastStore` (Schritt 3: In-Memory, Schritt 9: TypeORM, Tabelle `daily_forecast`). */
export const FORECAST_STORE = 'FORECAST_STORE';

/** Ein Vorhersagetag, Werte `number | null` und ungerundet. */
export interface ForecastDay {
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipitationSum: number | null;
  weatherCode: number | null;
}

/** Eine abgerufene Vorhersage: alle Tage eines Abrufs mit gemeinsamem Abrufzeitpunkt. */
export interface StoredForecast {
  days: ForecastDay[];
  /** Abrufzeitpunkt (UTC). */
  fetchedAt: string;
  /** Import, der die Vorhersage geliefert hat; `null` beim Altbestand (`forecast.json`). */
  importId: number | null;
}

export interface ForecastStore {
  /** Die zuletzt abgerufene Vorhersage oder `null`, wenn es keine gibt. */
  getLatest(): Promise<StoredForecast | null>;

  /** Speichert eine neu abgerufene Vorhersage (ersetzt die Tage desselben Abrufs als Ganzes). */
  save(forecast: StoredForecast): Promise<void>;
}
