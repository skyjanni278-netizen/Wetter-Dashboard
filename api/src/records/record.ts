/** Stundenrekord (03 B2.2); `observationId` bis Schritt 9 `null`, `corrected` bis Schritt 12a `false`. */
export interface HourRecordResource {
  value: number | null;
  timeLocal: string;
  date: string;
  observationId: number | null;
  corrected: boolean;
}

/** `GET /api/records` (US06). Rekorde sind `null`, wenn es keine passenden Daten gibt (US06-5). */
export interface Records {
  locationId: number;
  hottest: HourRecordResource | null;
  coldest: HourRecordResource | null;
  wettestDay: { value: number | null; date: string } | null;
  longestDryPeriod: { days: number; from: string; to: string } | null;
  daysCounted: number;
  /** Vorhersagestunden zählen nie (R11, F13). */
  excludesPredictions: true;
}
