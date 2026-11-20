/**
 * Tag nach B2.2 in der Grundform von Schritt 2. Berechnete Felder (`hoursObserved`,
 * `hoursPredicted`, `complete`, `current`, `observed`, `predicted`) und je Stunde `id`,
 * `source`, `isPrediction`, `correctedAt` folgen mit den Fachregeln (Schritt 7) bzw. der
 * Datenbank (Schritt 9).
 */
export interface DayHour {
  /** Berliner Ortszeit; im Altbestand ohne Offset, z. B. `2026-11-10T14:00` (Befund Z1). */
  timeLocal: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

export interface Day {
  id: string;
  date: string;
  locationId: number;
  timezone: string;
  isToday: boolean;
  hoursExpected: number;
  hours: DayHour[];
}
