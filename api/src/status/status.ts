/** R25: `never` ohne erfolgreichen Import, `ok` bis 2 h danach, sonst `delayed`. */
export type UpdateState = 'never' | 'ok' | 'delayed';

/**
 * Datenstand nach B2.2, ohne Fehlertext (US07-1). `nextScheduledUpdateAt`, `daysWithData`,
 * `daysComplete` und `gapCount` folgen mit Scheduler und Fachregeln (R26).
 */
export interface Status {
  locationId: number;
  today: string;
  timezone: string;
  dataFrom: string | null;
  dataTo: string | null;
  lastSuccessfulUpdateAt: string | null;
  updateState: UpdateState;
}
