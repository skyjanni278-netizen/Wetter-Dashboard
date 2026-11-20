/**
 * Datenstand nach B2.2, ohne Fehlertext (US07-1). `nextScheduledUpdateAt`, `daysWithData`,
 * `daysComplete` und `gapCount` folgen mit Import und Fachregeln (R25, R26).
 */
export interface Status {
  locationId: number;
  today: string;
  timezone: string;
  dataFrom: string | null;
  dataTo: string | null;
  lastSuccessfulUpdateAt: string | null;
  updateState: 'never' | 'ok' | 'delayed';
}
