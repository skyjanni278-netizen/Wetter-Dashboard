/** Antworten der Express-API (Monat, Jahr), bis Monat und Jahr in Schritt 8 umziehen. */

export interface MonthSummary {
  day: number;
  avgTemp: number;
  totalPrecip: number;
}

export interface MonthResponse {
  year: string;
  month: string;
  data: MonthSummary[];
}

export interface YearSummary {
  month: number;
  avgTemp: number;
  totalPrecip: number;
}

export interface YearResponse {
  year: string;
  data: YearSummary[];
}
